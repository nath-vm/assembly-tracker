import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import ConfirmDialog from "./ConfirmDialog";
import Pagination from "./Pagination";
import SkippedRowsDialog from "./SkippedRowsDialog";
import DuplicateResolverDialog from "./DuplicateResolverDialog";
import ImportResultDialog from "./ImportResultDialog";
import { getMaterials, addMaterial, editMaterial, deleteMaterial, checkMaterialDuplicates, bulkImportMaterials, syncAllMaterials } from "../services/materialService";
import * as XLSX from "xlsx";

// ─── Header matching (CIS-style: normalise + pattern table) ──────────────────
const normCol = (s) => String(s || "").toLowerCase().replace(/[\s.#_\-/(),]+/g, "");

const HEADER_PATTERNS = [
  { schema: "code",          aliases: ["code","itemcode","itemno","item#","sku"] },
  { schema: "name",          aliases: ["name","materialname","material","description","desc","itemname","itemdescription","matname","matdesc"] },
  { schema: "unitOfMeasure", aliases: ["uom","unit","unitofmeasure","measure","units","um","unitm"] },
  { schema: "price",         aliases: ["price","unitprice","cost","unitcost","amount","rate","unitrate"] },
];

function matchHeader(col) {
  const n = normCol(col);
  for (const p of HEADER_PATTERNS) {
    if (p.aliases.includes(n)) return p.schema;
  }
  return null;
}

// ─── Parse a workbook sheet (CIS-style: smart header detection, extraMappings) ─
function parseSheet(wb, sheetName, extraMappings = {}) {
  const ws   = wb.Sheets[sheetName];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (!raw || raw.length === 0) return null;

  // Find best header row by scanning first 20 rows (same as CIS)
  let headerIdx = 0, bestScore = 0;
  const limit = Math.min(raw.length, 20);
  for (let i = 0; i < limit; i++) {
    const score = raw[i].reduce((acc, cell) => {
      const v = String(cell).trim();
      return acc + (v && (matchHeader(v) || extraMappings[String(v).trim()]) ? 1 : 0);
    }, 0);
    if (score > bestScore) { bestScore = score; headerIdx = i; }
  }
  if (bestScore === 0) return null;

  const headerRow = raw[headerIdx].map(h => String(h).trim());
  const mappedHeaders = [], unmappedHeaders = [];
  const colMap = {}; // colIndex → schema field

  headerRow.forEach((h, i) => {
    if (!h) return;
    const schema = matchHeader(h) || extraMappings[h] || null;
    if (schema) { colMap[i] = schema; mappedHeaders.push({ original: h, schema }); }
    else          { unmappedHeaders.push(h); }
  });

  // Must have at least a name column
  const nameColIdx = Object.entries(colMap).find(([, s]) => s === "name")?.[0];
  if (nameColIdx === undefined) return null;

  const dataRows = raw.slice(headerIdx + 1);
  // Drop if first data row looks like another copy of the header
  if (dataRows[0] && headerRow.some(h => h && Object.values(dataRows[0]).includes(h))) {
    dataRows.shift();
  }

  const validRows = [], skippedRows = [];
  dataRows.forEach((row, idx) => {
    const isEmpty = row.every(v => !String(v).trim());
    if (isEmpty) return;

    const record = {};
    Object.entries(colMap).forEach(([ci, schema]) => {
      let val = String(row[ci] ?? "").trim();
      // Convert scientific notation (e.g. 1.23E+5 → "123000")
      if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(val)) {
        try { val = String(Math.round(parseFloat(val))); } catch (_) {}
      }
      record[schema] = val;
    });

    const name = (record.name || "").trim();
    const price = record.price !== undefined ? parseFloat(record.price) : NaN;
    const cleanPrice = isNaN(price) ? 0 : price;

    if (!name) {
      skippedRows.push({
        rowNumber: idx + headerIdx + 2,
        reason: "Missing material name",
        rowData: [record.code || "", name, record.unitOfMeasure || "", cleanPrice],
      });
    } else {
      validRows.push({ code: record.code || "", name, unitOfMeasure: record.unitOfMeasure || "", price: cleanPrice });
    }
  });

  return {
    mappedHeaders,
    unmappedHeaders,
    validRows,
    skippedRows,
    previewRows: validRows.slice(0, 20),
    totalRows: validRows.length + skippedRows.length,
  };
}

function MaterialManager({ registerBackHandler }) {
  const [materials,      setMaterials]      = useState([]);
  const [filter,         setFilter]         = useState("");
  const [page,           setPage]           = useState(1);
  const [showForm,       setShowForm]       = useState(false);
  const [editing,        setEditing]        = useState(null);
  const [form,           setForm]           = useState({ name: "", unitOfMeasure: "Unit/s", price: "" });
  const [error,          setError]          = useState("");
  const [hasUnsaved,     setHasUnsaved]     = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [importing,      setImporting]      = useState(false);
  const [confirmDialog,  setConfirmDialog]  = useState({ open: false, type: null, payload: null, onConfirm: null });
  const [isMobile,       setIsMobile]       = useState(window.innerWidth <= 640);
  const ITEMS_PER_PAGE = 15;

  // ── Import state ──────────────────────────────────────────────────────────
  const [importStep,     setImportStep]     = useState(null);
  const [invalidRows,    setInvalidRows]    = useState([]);
  const [validRows,      setValidRows]      = useState([]);
  const [duplicatesData, setDuplicatesData] = useState([]);
  const [importResult,   setImportResult]   = useState(null);
  // CIS-style: preview includes sheet picker + column mapping override
  const [importPreview,  setImportPreview]  = useState(null);
  // auto-skipped count (identical records — no diff, no need to bother admin)
  const autoSkippedRef = useRef(0);
  const rawWorkbookRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const data = await getMaterials();
      if (Array.isArray(data)) setMaterials(data);
      else setMaterials([]);
    } catch {
      setMaterials([]);
    }
  }, []);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const filtered = materials.filter((m) =>
    !filter ||
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    (m.unitOfMeasure || "").toLowerCase().includes(filter.toLowerCase()) ||
    String(m.price ?? "").includes(filter)
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const initialName  = editing ? editing.name : "";
  const initialUOM   = editing ? editing.unitOfMeasure || "Unit/s" : "Unit/s";
  const initialPrice = editing ? (editing.price !== undefined && editing.price !== null ? String(editing.price) : "") : "";
  const isDirty = form.name !== initialName || form.unitOfMeasure !== initialUOM || String(form.price) !== initialPrice;

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setConfirmDialog({
        open:      true,
        type:      "cancel",
        onConfirm: () => {
          setEditing(null);
          setForm({ name: "", unitOfMeasure: "Unit/s", price: "" });
          setError("");
          setShowForm(false);
          setHasUnsaved(false);
          setConfirmDialog({ open: false });
        }
      });
    } else {
      setEditing(null);
      setForm({ name: "", unitOfMeasure: "Unit/s", price: "" });
      setError("");
      setShowForm(false);
      setHasUnsaved(false);
    }
  }, [isDirty]);

  useEffect(() => {
    if (!showForm) return;
    const handler = (e) => { if (e.key === "Escape") handleCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showForm, handleCancel]);

  const handleBack = (destination) => {
    if (!hasUnsaved) { if (destination) destination(); return; }
    setConfirmDialog({
      open:      true,
      type:      "unsaved",
      payload:   { message: "You have an unsaved form open. Discard and leave?" },
      onConfirm: () => {
        setShowForm(false);
        setHasUnsaved(false);
        setConfirmDialog({ open: false });
        if (destination) destination();
      },
      onCancel: () => setConfirmDialog({ open: false })
    });
  };

  useEffect(() => {
    if (registerBackHandler) registerBackHandler((destination) => handleBack(destination));
  }, [hasUnsaved]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = (mat) => {
    setEditing(mat);
    setForm({
      name:          mat.name,
      unitOfMeasure: mat.unitOfMeasure || "Unit/s",
      price:         mat.price !== undefined && mat.price !== null ? String(mat.price) : ""
    });
    setShowForm(true);
    setHasUnsaved(true);
  };

  const handleDelete = (mat) => {
    setConfirmDialog({
      open:      true,
      type:      "delete",
      payload:   { label: mat.name },
      onConfirm: async () => {
        try {
          await deleteMaterial(mat._id);
          setMaterials((prev) => prev.filter((m) => m._id !== mat._id));
          toast.success(`"${mat.name}" deleted successfully.`);
        } catch {
          toast.error(`Failed to delete "${mat.name}". Please try again.`);
        }
        setConfirmDialog({ open: false });
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.unitOfMeasure.trim()) { setError("Unit of Measure is required."); return; }
    if (!editing && materials.some((m) => m.name.toLowerCase() === form.name.trim().toLowerCase())) {
      setError("A material with this name already exists.");
      return;
    }
    setError("");
    setConfirmDialog({
      open:      true,
      type:      editing ? "save" : "custom",
      payload:   { message: editing ? "Save changes to this material?" : "Add this material?" },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        try {
          if (editing) {
            const updated = await editMaterial(editing._id, form.name.trim(), form.unitOfMeasure.trim(), form.price);
            if (updated?._id) {
              setMaterials((prev) => prev.map((m) => m._id === updated._id ? updated : m));
              const syncCount = updated.assembliesUpdated || 0;
              const syncMsg   = syncCount > 0
                ? ` ${syncCount} ${syncCount === 1 ? "assembly" : "assemblies"} synced.`
                : "";
              toast.success(`"${form.name.trim()}" updated successfully.${syncMsg}`);
            } else if (updated?.error) {
              setError(updated.error); return;
            } else {
              await loadMaterials();
              toast.success(`"${form.name.trim()}" updated successfully.`);
            }
          } else {
            const created = await addMaterial(form.name.trim(), form.unitOfMeasure.trim(), form.price);
            if (created?._id) {
              setMaterials((prev) => [...prev, created]);
              toast.success(`"${form.name.trim()}" added successfully.`);
            } else if (created?.error) {
              setError(created.error); return;
            }
          }
          setEditing(null);
          setForm({ name: "", unitOfMeasure: "Unit/s", price: "" });
          setError("");
          setShowForm(false);
          setHasUnsaved(false);
        } catch (err) {
          setError(err?.message || "Failed to save material.");
          toast.error(err?.message || "Failed to save material.");
        }
      }
    });
  };

  const handleSyncAll = () => {
    setConfirmDialog({
      open:    true,
      type:    "custom",
      payload: { message: "Sync all materials to assemblies?\n\nThis will update the UOM and price of every matching material item across all assemblies to match the current materials list." },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        setSyncing(true);
        try {
          const result = await syncAllMaterials();
          if (result?.error) {
            toast.error("Sync failed: " + result.error);
          } else {
            toast.success(
              result.totalAssembliesUpdated > 0
                ? `Sync complete — all ${result.totalMaterials} materials synced. ${result.materialsMatched} matched and updated across ${result.totalAssembliesUpdated} assemblies.`
                : `Sync complete — all ${result.totalMaterials} materials synced. No assemblies needed updating.`
            );
          }
        } catch (err) {
          toast.error("Sync failed: " + (err?.message || "Unknown error"));
        } finally {
          setSyncing(false);
        }
      }
    });
  };

  // ── Step 1: Read file → build preview → show ImportPreviewDialog ────────────
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array", raw: false });
        rawWorkbookRef.current = wb;

        // Pick best sheet — the one with the highest header recognition score (CIS logic)
        const sheets = wb.SheetNames;
        let bestSheet = sheets[0], bestScore = 0;
        for (const sName of sheets) {
          const ws  = wb.Sheets[sName];
          const rr  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
          const lim = Math.min(rr.length, 20);
          for (let i = 0; i < lim; i++) {
            const score = rr[i].reduce((acc, cell) => {
              const v = String(cell).trim();
              return acc + (v && matchHeader(v) ? 1 : 0);
            }, 0);
            if (score > bestScore) { bestScore = score; bestSheet = sName; }
          }
        }

        const parsed = parseSheet(wb, bestSheet, {});
        if (!parsed) {
          toast.error("No recognisable column headers found. Make sure the file has a column like \"Name\", \"Material\", or \"Description\".");
          setImporting(false);
          return;
        }

        setImportPreview({
          fileName:     file.name,
          sheets,
          selectedSheet: bestSheet,
          validCount:   parsed.validRows.length,
          skippedCount: parsed.skippedRows.length,
          totalRows:    parsed.totalRows,
          mappedHeaders:   parsed.mappedHeaders,
          unmappedHeaders: parsed.unmappedHeaders,
          previewRows:     parsed.previewRows,
        });
      } catch (err) {
        toast.error("Failed to read file: " + (err?.message || "Unknown error"));
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => { toast.error("Failed to read file."); setImporting(false); };
    reader.readAsArrayBuffer(file);
  };

  // ── Step 2: User confirmed preview (possibly re-scanned with different sheet / mappings) ─
  const handlePreviewConfirm = async ({ selectedSheet, extraMappings }) => {
    setImportPreview(null);
    setImporting(true);

    try {
      const wb     = rawWorkbookRef.current;
      const parsed = parseSheet(wb, selectedSheet, extraMappings);
      if (!parsed) {
        toast.error("No valid data found in selected sheet.");
        setImporting(false);
        return;
      }

      const { validRows: rows, skippedRows: skipped } = parsed;
      setInvalidRows(skipped);

      if (rows.length === 0) {
        toast.warning("No valid records found after mapping.");
        if (skipped.length > 0) setImportStep("skipped");
        setImporting(false);
        return;
      }

      // CIS-style: check duplicates against existing materials
      const { matches } = await checkMaterialDuplicates(rows.map(r => r.name));
      const existingMap = new Map((matches || []).map(m => [m.name.toLowerCase(), m]));

      // Auto-skip identical records (same name + same UOM + same price) — no need to ask admin
      const COMPARE = (incoming, existing) =>
        (incoming.unitOfMeasure || "").toLowerCase().trim() === (existing.unitOfMeasure || "").toLowerCase().trim() &&
        Math.abs((incoming.price || 0) - (existing.price || 0)) < 0.001;

      const dupeRows = [], uniqueRows = [], autoSkipped = [];
      rows.forEach(row => {
        const existing = existingMap.get(row.name.toLowerCase());
        if (!existing) {
          uniqueRows.push(row);
        } else if (COMPARE(row, existing)) {
          autoSkipped.push(row); // identical — skip silently
        } else {
          dupeRows.push({ name: row.name, existing, incoming: { unitOfMeasure: row.unitOfMeasure, price: row.price } });
        }
      });

      autoSkippedRef.current = autoSkipped.length;
      setValidRows(uniqueRows);

      if (dupeRows.length > 0) {
        setDuplicatesData(dupeRows);
        setImportStep("duplicate");
      } else {
        await performImport(uniqueRows, {}, skipped, autoSkipped.length);
      }

      if (skipped.length > 0 && dupeRows.length === 0) {
        // show skipped dialog after result dialog if no dupes
        setTimeout(() => setImportStep("skipped"), 200);
      }
    } catch (err) {
      toast.error("Import failed: " + (err?.message || "Unknown error"));
    } finally {
      setImporting(false);
    }
  };

  // ── Step 3 (optional): Duplicate resolution ──────────────────────────────
  const performImport = async (rows, decisions, skipped = invalidRows, autoSkippedCount = autoSkippedRef.current) => {
    setImporting(true);
    try {
      const materialsToImport = rows.map(row => ({
        code: row.code, name: row.name, unitOfMeasure: row.unitOfMeasure, price: row.price, action: "skip"
      }));
      for (const dup of duplicatesData) {
        materialsToImport.push({
          code: "", name: dup.name,
          unitOfMeasure: dup.incoming.unitOfMeasure,
          price: dup.incoming.price,
          action: decisions[dup.name] || "skip"
        });
      }
      const result = await bulkImportMaterials(materialsToImport);
      // Attach auto-skip count so ImportResultDialog can show it
      setImportResult({ ...result, autoSkipped: autoSkippedCount, invalid: skipped.length });
      setImportStep("result");
      loadMaterials();
    } catch (err) {
      toast.error("Import failed: " + (err?.message || "Unknown error"));
    } finally {
      setImporting(false);
    }
  };

  const closeImportDialogs = () => {
    setImportStep(null);
    setInvalidRows([]);
    setValidRows([]);
    setDuplicatesData([]);
    setImportResult(null);
    setImportPreview(null);
    autoSkippedRef.current = 0;
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative" }}>
      {/* Import loading overlay */}
      {importing && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "32px 48px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16
          }}>
            <div style={{
              width: 44, height: 44,
              border: "4px solid #e0f5fb",
              borderTop: "4px solid #2596be",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1d3557", marginBottom: 4 }}>
                Processing File
              </div>
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                Please wait...
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 14px 0", fontWeight: 700, fontSize: 26, color: "#222" }}>Materials</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            type="text" placeholder="Search by name, UOM, or price..."
            value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            style={{ flex: "1 1 180px", minWidth: 0, padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 15 }}
          />
          <button className="btn-primary" onClick={() => { setEditing(null); setForm({ name: "", unitOfMeasure: "Unit/s", price: "" }); setShowForm(true); setHasUnsaved(true); }}>
            Add Material
          </button>
          <label className="btn-secondary" style={{ cursor: "pointer", display: "inline-block", padding: "8px 16px", background: "#2596be", color: "#fff", borderRadius: 6, fontWeight: 600 }}>
            Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
          <button
            onClick={handleSyncAll} disabled={syncing}
            title="Push current material prices and UOM to all assemblies"
            style={{ padding: "8px 16px", background: syncing ? "#ccc" : "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer" }}
          >
            {syncing ? "Syncing..." : "⟳ Sync to Assemblies"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target.classList.contains("modal-overlay")) handleCancel(); }}>
          <div className="modal" style={{ maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: "#2596be" }}>{editing ? "Edit Material" : "Add Material"}</h3>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <label style={{ fontWeight: 500, marginBottom: 6, display: "block", color: "#2596be" }}>Material Name *</label>
                <input name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Material Name" autoFocus style={{ width: "100%", marginBottom: 16, padding: "12px 14px", fontSize: 16, borderRadius: 8, border: "1.5px solid #e0e0e0" }} />
                <label style={{ fontWeight: 500, marginBottom: 6, display: "block", color: "#2596be" }}>Unit of Measure</label>
                <input name="unitOfMeasure" value={form.unitOfMeasure} onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })} placeholder="e.g. pcs, kg, m" style={{ width: "100%", marginBottom: 16, padding: "12px 14px", fontSize: 16, borderRadius: 8, border: "1.5px solid #e0e0e0" }} />
                <label style={{ fontWeight: 500, marginBottom: 6, display: "block", color: "#2596be" }}>Unit Price (optional)</label>
                <input type="number" step="0.01" min="0" name="price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" style={{ width: "100%", marginBottom: 16, padding: "12px 14px", fontSize: 16, borderRadius: 8, border: "1.5px solid #e0e0e0" }} />
                {error && <div style={{ color: "#d00", background: "#fff0f0", padding: 10, borderRadius: 4, marginBottom: 12 }}>{error}</div>}
                <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
                  <button type="button" onClick={handleCancel} style={{ flex: 1, background: "#eee", color: "#444", border: "none", borderRadius: "0 0 0 8px", padding: "16px 0", fontWeight: 600, fontSize: 16, cursor: "pointer", borderTop: "1px solid #f0f0f0", borderRight: "1px solid #f0f0f0" }}>Cancel</button>
                  <button type="submit" style={{ flex: 1, background: "#2596be", color: "#fff", border: "none", borderRadius: "0 0 8px 0", padding: "16px 0", fontWeight: 600, fontSize: 16, cursor: "pointer", borderTop: "1px solid #f0f0f0" }}>{editing ? "Update" : "Add"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paginated.length === 0
            ? <div style={{ textAlign: "center", color: "#888", padding: 32 }}>No materials found.</div>
            : paginated.map((mat, idx) => (
              <div key={mat._id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafb", border: "1px solid #eee", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ color: "#bbb", fontWeight: 500, fontSize: 13, minWidth: 24 }}>{(page - 1) * ITEMS_PER_PAGE + idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{mat.name}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>{mat.unitOfMeasure || "Unit/s"}{mat.price ? ` | ₱${Number(mat.price).toFixed(2)}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn-secondary" onClick={() => handleEdit(mat)} style={{ padding: "6px 12px", fontSize: 13 }}>Edit</button>
                  <button className="btn-danger"    onClick={() => handleDelete(mat)} style={{ padding: "6px 12px", fontSize: 13 }}>Delete</button>
                </div>
              </div>
            ))
          }
        </div>
      ) : (
        <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
          {paginated.length === 0
            ? <div style={{ textAlign: "center", color: "#888", padding: 32 }}>No materials found.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: "#f8fafb", color: "#888", fontWeight: 600, fontSize: 15 }}>
                    <th style={{ textAlign: "left",   padding: "10px 12px", width: 48,  position: "sticky", top: 0, background: "#f8fafb", zIndex: 1, boxShadow: "0 1px 0 #e5e7eb" }}>#</th>
                    <th style={{ textAlign: "left",   padding: "10px 12px",             position: "sticky", top: 0, background: "#f8fafb", zIndex: 1, boxShadow: "0 1px 0 #e5e7eb" }}>Name</th>
                    <th style={{ textAlign: "left",   padding: "10px 12px", width: 160, position: "sticky", top: 0, background: "#f8fafb", zIndex: 1, boxShadow: "0 1px 0 #e5e7eb" }}>Unit of Measure</th>
                    <th style={{ textAlign: "right",  padding: "10px 12px", width: 120, position: "sticky", top: 0, background: "#f8fafb", zIndex: 1, boxShadow: "0 1px 0 #e5e7eb" }}>Unit Price</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", width: 140, position: "sticky", top: 0, background: "#f8fafb", zIndex: 1, boxShadow: "0 1px 0 #e5e7eb" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((mat, idx) => (
                    <tr key={mat._id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafb" }}>
                      <td style={{ padding: "8px 12px", color: "#bbb" }}>{(page - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                      <td style={{ padding: "8px 12px" }}>{mat.name}</td>
                      <td style={{ padding: "8px 12px" }}>{mat.unitOfMeasure || "Unit/s"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{mat.price ? `₱${Number(mat.price).toFixed(2)}` : "-"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                          <button className="btn-secondary" onClick={() => handleEdit(mat)} style={{ padding: "6px 14px", fontSize: 14 }}>Edit</button>
                          <button className="btn-danger"    onClick={() => handleDelete(mat)} style={{ padding: "6px 14px", fontSize: 14 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* ── CIS-style Import Preview Dialog ────────────────────────────────── */}
      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onConfirm={handlePreviewConfirm}
          onCancel={() => setImportPreview(null)}
        />
      )}

      {importStep === "skipped" && (
        <SkippedRowsDialog invalidRows={invalidRows} onClose={closeImportDialogs} />
      )}
      {importStep === "duplicate" && (
        <DuplicateResolverDialog
          duplicates={duplicatesData}
          existingMap={new Map(duplicatesData.map(d => [d.name, d.existing]))}
          onResolve={async (decisions) => {
            if (Object.keys(decisions).length === 0) closeImportDialogs();
            else await performImport(validRows, decisions);
          }}
        />
      )}
      {importStep === "result" && importResult && (
        <ImportResultDialog result={importResult} onClose={closeImportDialogs} />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        type={confirmDialog.type}
        payload={confirmDialog.payload}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false })}
      />
    </div>
  );
}

// ─── CIS-style ImportPreviewDialog ────────────────────────────────────────────
// Sheet picker + column mapping override + 20-row data preview
function ImportPreviewDialog({ preview, onConfirm, onCancel }) {
  const [selectedSheet,  setSelectedSheet]  = useState(preview.selectedSheet);
  const [extraMappings,  setExtraMappings]  = useState({});
  // When sheet changes we need to re-scan — but we only have the parsed preview
  // data here; the actual re-scan happens in handlePreviewConfirm on the parent.
  // So we just track the selection and pass it back.

  useEffect(() => {
    setSelectedSheet(preview.selectedSheet);
    setExtraMappings({});
  }, [preview]);

  const schemaOptions = [
    { value: "",             label: "— ignore this column —" },
    { value: "name",         label: "Material Name" },
    { value: "code",         label: "Code / Item #" },
    { value: "unitOfMeasure",label: "Unit of Measure" },
    { value: "price",        label: "Unit Price" },
  ];

  const handleConfirm = () => {
    onConfirm({ selectedSheet, extraMappings });
  };

  const inputStyle = {
    padding: "6px 10px", fontSize: 13, border: "1px solid #d1d5db",
    borderRadius: 6, fontFamily: "inherit", outline: "none", background: "#fff",
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 620, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#2596be"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          <h3 style={{ margin: 0, color: "#1d3557", fontSize: 17 }}>Import Preview</h3>
        </div>

        <div className="modal-body" style={{ padding: "20px 24px" }}>
          {/* File name */}
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>File:</strong> {preview.fileName}
          </p>

          {/* Sheet picker — only shown for multi-sheet files */}
          {preview.sheets.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Workbook has multiple sheets — select which one to import:
              </div>
              <select
                value={selectedSheet}
                onChange={e => setSelectedSheet(e.target.value)}
                style={{ ...inputStyle, minWidth: 220 }}
              >
                {preview.sheets.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {selectedSheet !== preview.selectedSheet && (
                <div style={{ marginTop: 6, padding: "6px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
                  Sheet changed — the file will be re-scanned when you proceed.
                </div>
              )}
            </div>
          )}

          {/* Summary stat cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "Total rows found",  value: preview.totalRows,    bg: "#1976d2", fg: "#fff" },
              { label: "Ready to import",   value: preview.validCount,   bg: "#2e7d32", fg: "#fff" },
              { label: "Will be skipped",   value: preview.skippedCount, bg: preview.skippedCount > 0 ? "#ed6c02" : "#e5e7eb", fg: preview.skippedCount > 0 ? "#fff" : "#9ca3af" },
            ].map(({ label, value, bg, fg }) => (
              <div key={label} style={{ flex: "1 1 140px", background: bg, color: fg, borderRadius: 10, padding: "12px 16px", textAlign: "center", minWidth: 110 }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Detected column mappings */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Detected columns ({preview.mappedHeaders.length} recognised):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {preview.mappedHeaders.map(({ original, schema }) => (
                <span
                  key={original}
                  title={`"${original}" → ${schema}`}
                  style={{ background: "#dcfce7", color: "#166534", border: "1px solid #86efac", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}
                >
                  ✓ {original} → <em>{schema}</em>
                </span>
              ))}
            </div>
          </div>

          {/* Unrecognised columns — let admin assign */}
          {preview.unmappedHeaders.length > 0 && (
            <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 10 }}>
                Unrecognised columns ({preview.unmappedHeaders.length}) — assign or leave as ignored:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {preview.unmappedHeaders.map(col => (
                  <div key={col} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <code style={{ fontSize: 12, fontFamily: "monospace", color: "#374151", minWidth: 160, fontWeight: 600 }}>
                      "{col}"
                    </code>
                    <select
                      value={extraMappings[col] || ""}
                      onChange={e => setExtraMappings(m => ({ ...m, [col]: e.target.value }))}
                      style={{ ...inputStyle, minWidth: 200 }}
                    >
                      {schemaOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data preview table */}
          {preview.previewRows.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Data preview (first {preview.previewRows.length} rows):
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f3f4f6" }}>
                      {["Name", "Code", "Unit of Measure", "Unit Price"].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "#6b7280", fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <td style={{ padding: "5px 10px", borderTop: "1px solid #f3f4f6", fontWeight: 500 }}>{row.name}</td>
                        <td style={{ padding: "5px 10px", borderTop: "1px solid #f3f4f6", color: "#6b7280", fontFamily: "monospace", fontSize: 11 }}>{row.code || "—"}</td>
                        <td style={{ padding: "5px 10px", borderTop: "1px solid #f3f4f6", color: "#6b7280" }}>{row.unitOfMeasure || "—"}</td>
                        <td style={{ padding: "5px 10px", borderTop: "1px solid #f3f4f6", color: "#6b7280", textAlign: "right" }}>
                          {row.price ? `₱${Number(row.price).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.validCount > preview.previewRows.length && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, textAlign: "center" }}>
                  Showing first {preview.previewRows.length} of {preview.validCount} valid rows
                </div>
              )}
            </div>
          )}

          {preview.validCount === 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: 13 }}>
              No valid rows found. Make sure the file has a column with material names (e.g. "Name", "Material", "Description").
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 0 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, background: "#eee", color: "#444", border: "none", borderRadius: "0 0 0 8px", padding: "14px 0", fontWeight: 600, fontSize: 15, cursor: "pointer", borderTop: "1px solid #e5e7eb" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={preview.validCount === 0}
            style={{
              flex: 1, border: "none", borderRadius: "0 0 8px 0", padding: "14px 0",
              fontWeight: 600, fontSize: 15, borderTop: "1px solid #e5e7eb",
              background: preview.validCount === 0 ? "#e5e7eb" : "#2596be",
              color: preview.validCount === 0 ? "#9ca3af" : "#fff",
              cursor: preview.validCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            Proceed ({preview.validCount} records)
          </button>
        </div>
      </div>
    </div>
  );
}

export default MaterialManager;