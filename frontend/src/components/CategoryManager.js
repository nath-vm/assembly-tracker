import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import ConfirmDialog from "./ConfirmDialog";
import Pagination from "./Pagination";
import { apiFetch } from "../services/api";
import { bulkSaveCategories } from "../services/categoryService";

function CategoryManager({ onBack, registerBackHandler }) {
  const [categories,        setCategories]        = useState([]);
  const [pendingCategories, setPendingCategories] = useState([]);
  const [filter,            setFilter]            = useState("");
  const [page,              setPage]              = useState(1);
  const [saving,            setSaving]            = useState(false);
  const [hasUnsaved,        setHasUnsaved]        = useState(false);
  const [confirmDialog,     setConfirmDialog]     = useState({ open: false, type: null, payload: null, onConfirm: null });
  const [errorDialog,       setErrorDialog]       = useState("");

  // ─── New Category Modal ────────────────────────────────────────────────────
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [newCatName,     setNewCatName]     = useState("");
  const [newCatPosition, setNewCatPosition] = useState("");
  const [newCatError,    setNewCatError]    = useState("");

  const nextId = useRef(1);
  const ITEMS_PER_PAGE = 15;

  // ─── Load ──────────────────────────────────────────────────────────────────
  const loadCategories = async () => {
    try {
      const data = await apiFetch("/categories");
      if (Array.isArray(data)) setCategories(data);
      else setCategories([]);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  // ─── Sync pending from loaded ──────────────────────────────────────────────
  useEffect(() => {
    const cats = categories.map((c) => ({
      ...c,
      _id: c._id || `cat-${nextId.current++}`
    }));
    setPendingCategories(cats);
    setHasUnsaved(false);
  }, [categories]);

  // ─── Dirty check ──────────────────────────────────────────────────────────
  useEffect(() => {
    const changed =
      JSON.stringify(pendingCategories.map((c) => ({ key: c.key, label: c.label, hidden: c.hidden }))) !==
      JSON.stringify(categories.map((c) => ({ key: c.key, label: c.label, hidden: c.hidden })));
    setHasUnsaved(changed);
  }, [pendingCategories, categories]);

  // ─── Warn on browser close ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (hasUnsaved) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // ─── Register back handler with parent ────────────────────────────────────
  useEffect(() => {
    if (registerBackHandler) {
      registerBackHandler((destination) => handleBack(destination));
    }
  }, [hasUnsaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filter + Paginate ────────────────────────────────────────────────────
  const filtered = pendingCategories.filter(
    (c) => c.key !== "all" && (!filter || c.key.toLowerCase().includes(filter.toLowerCase()))
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered
    .map((cat) => ({ ...cat, originalIdx: pendingCategories.findIndex((c) => c._id === cat._id) }))
    .slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleNameChange = (originalIdx, value) => {
    setPendingCategories((prev) =>
      prev.map((c, i) => i === originalIdx ? { ...c, key: value, label: value } : c)
    );
  };

  const handleToggleHidden = (originalIdx) => {
    setPendingCategories((prev) =>
      prev.map((c, i) => i === originalIdx ? { ...c, hidden: !c.hidden } : c)
    );
  };

  const handleMoveUp = (originalIdx) => {
    if (originalIdx === 0) return;
    setPendingCategories((prev) => {
      const arr = [...prev];
      [arr[originalIdx - 1], arr[originalIdx]] = [arr[originalIdx], arr[originalIdx - 1]];
      return arr;
    });
  };

  const handleMoveDown = (originalIdx) => {
    if (originalIdx === pendingCategories.length - 1) return;
    setPendingCategories((prev) => {
      const arr = [...prev];
      [arr[originalIdx + 1], arr[originalIdx]] = [arr[originalIdx], arr[originalIdx + 1]];
      return arr;
    });
  };

  // ─── Remove — checks backend before allowing removal ──────────────────────
  const handleRemove = async (originalIdx, cat) => {
    const isExisting = categories.some((c) => c.key === cat.key);
    if (isExisting) {
      try {
        const data = await apiFetch(`/categories/${encodeURIComponent(cat.key)}/in-use`);
        if (data.inUse) {
          setErrorDialog(
            `Cannot delete "${cat.label}" — it has ${data.count} ${data.count === 1 ? "assembly" : "assemblies"} assigned to it. Reassign or delete those assemblies first.`
          );
          return;
        }
      } catch {
        setErrorDialog("Could not verify if category is in use. Please try again.");
        return;
      }
    }

    setConfirmDialog({
      open:      true,
      type:      "delete",
      payload:   { label: cat.label || cat.key },
      onConfirm: () => {
        setPendingCategories((prev) => prev.filter((_, i) => i !== originalIdx));
        setConfirmDialog({ open: false });
      }
    });
  };

  // ─── Add Category Modal ───────────────────────────────────────────────────
  const handleOpenAddModal = () => {
    setNewCatName("");
    setNewCatPosition("");
    setNewCatError("");
    setShowAddModal(true);
  };

  const handleConfirmAdd = () => {
    if (!newCatName.trim()) {
      setNewCatError("Category name is required.");
      return;
    }

    const nonAllCats = pendingCategories.filter((c) => c.key !== "all");
    const total      = nonAllCats.length;
    let   position   = newCatPosition === "" ? total : parseInt(newCatPosition) - 1;

    if (isNaN(position) || position < 0) position = 0;
    if (position > total)                position = total;

    const newCat = {
      key:    newCatName.trim(),
      label:  newCatName.trim(),
      _id:    `cat-${nextId.current++}`,
      hidden: false
    };

    setPendingCategories((prev) => {
      const allCat = prev.filter((c) => c.key === "all");
      const rest   = prev.filter((c) => c.key !== "all");
      rest.splice(position, 0, newCat);
      return [...allCat, ...rest];
    });

    const newPage = Math.floor(position / ITEMS_PER_PAGE) + 1;
    setPage(newPage);
    setShowAddModal(false);
  };

  // ─── Navigate away with unsaved check ────────────────────────────────────
  const handleBack = (destination) => {
    const leave = typeof destination === "function" ? destination : onBack;
    if (!hasUnsaved) { leave(); return; }
    setConfirmDialog({
      open:      true,
      type:      "unsaved",
      payload:   { message: "You have unsaved changes. Save before leaving?" },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        const keys   = pendingCategories.map((c) => c.key.trim());
        const labels = pendingCategories.map((c) => c.label.trim());
        if (keys.includes("") || labels.includes("")) {
          setErrorDialog("All category names are required before saving.");
          return;
        }
        if (new Set(keys).size !== keys.length) {
          setErrorDialog("Category names must be unique.");
          return;
        }
        setSaving(true);
        try {
          const toSave = pendingCategories.map((cat, i) => ({ ...cat, order: i }));
          await bulkSaveCategories(toSave);
        } catch (err) {
          setErrorDialog(err.message || "Failed to save.");
          setSaving(false);
          return;
        }
        setSaving(false);
        leave();
      },
      onCancel: () => {
        setConfirmDialog({ open: false });
        leave();
      }
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = () => {
      const keys   = pendingCategories.map((c) => c.key.trim());
      const labels = pendingCategories.map((c) => c.label.trim());

      if (keys.includes("") || labels.includes("")) {
        setErrorDialog("All category names are required.");
        return;
      }
      if (new Set(keys).size !== keys.length) {
        setErrorDialog("Category names must be unique.");
        return;
      }

      setConfirmDialog({
        open:      true,
        type:      "save",
        onConfirm: async () => {
          setSaving(true);
          setConfirmDialog({ open: false });
          try {
            const toSave = pendingCategories.map((cat, i) => ({ ...cat, order: i }));
            const res    = await bulkSaveCategories(toSave);
            if (res?.error) { setErrorDialog(res.error); setSaving(false); return; }
            await loadCategories();
            toast.success("Categories saved successfully.");
          } catch (err) {
            setErrorDialog(err.message || "Failed to save categories.");
            toast.error("Failed to save categories.");
          } finally {
            setSaving(false);
          }
        }
      });
    };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ─── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 14px 0", fontWeight: 700, fontSize: 26, color: "#222" }}>Categories</h2>

        {/* Toolbar: one row on desktop, wraps on mobile */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search categories..."
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            style={{
              flex:         "1 1 180px",
              minWidth:     0,
              boxSizing:    "border-box",
              padding:      "8px 12px",
              borderRadius: 6,
              border:       "1px solid #ccc",
              fontSize:     15
            }}
          />
          <button className="btn-primary" onClick={handleOpenAddModal} style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
            Add Category
          </button>
          <button className="btn-success" onClick={handleSave} disabled={saving} style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* ─── Unsaved indicator ────────────────────────────────────────────── */}
      {hasUnsaved && (
        <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 6, padding: "8px 14px", marginBottom: 16, color: "#856404", fontSize: 14 }}>
          You have unsaved changes.
        </div>
      )}

      {/* ─── Table ────────────────────────────────────────────────────────── */}
      <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        {paginated.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: 32, fontSize: 18 }}>
            No categories found.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#f8fafb", color: "#888", fontWeight: 600, fontSize: 15 }}>
                <th style={{ textAlign: "left", padding: "10px 12px", width: 48 }}>#</th>
                <th style={{ textAlign: "left", padding: "10px 12px" }}>Name</th>
                <th style={{ textAlign: "center", padding: "10px 12px", width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((cat, idx) => {
                const { originalIdx } = cat;
                const rowNum = (page - 1) * ITEMS_PER_PAGE + idx + 1;
                return (
                  <tr key={cat._id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafb" }}>
                    <td style={{ padding: "8px 12px", color: "#888", fontWeight: 500 }}>{rowNum}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        value={cat.key}
                        onChange={(e) => handleNameChange(originalIdx, e.target.value)}
                        placeholder="Category name"
                        style={{
                          width:        "100%",
                          boxSizing:    "border-box",
                          padding:      "8px 10px",
                          fontSize:     15,
                          borderRadius: 5,
                          border:       "1px solid #e0e0e0",
                          background:   cat.hidden ? "#f5f5f5" : "#fff",
                          color:        cat.hidden ? "#aaa" : "#222"
                        }}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                        <button onClick={() => handleMoveUp(originalIdx)}   disabled={originalIdx === 0}                            title="Move Up"   style={iconBtn(originalIdx === 0)}>↑</button>
                        <button onClick={() => handleMoveDown(originalIdx)} disabled={originalIdx === pendingCategories.length - 1} title="Move Down" style={iconBtn(originalIdx === pendingCategories.length - 1)}>↓</button>
                        <button
                          onClick={() => handleToggleHidden(originalIdx)}
                          style={{
                            background:   cat.hidden ? "#fbe9e9" : "#f0f4f8",
                            color:        cat.hidden ? "#b00"    : "#888",
                            border:       "none",
                            borderRadius: 5,
                            fontWeight:   500,
                            fontSize:     13,
                            padding:      "4px 10px",
                            cursor:       "pointer",
                            minWidth:     60
                          }}
                        >
                          {cat.hidden ? "Unhide" : "Hide"}
                        </button>
                        <button
                          onClick={() => handleRemove(originalIdx, cat)}
                          title="Remove"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#b00", fontSize: 20, padding: 0, lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Pagination ───────────────────────────────────────────────────── */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* ─── Add Category Modal ───────────────────────────────────────────── */}
      {showAddModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.25)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: 10, padding: 32,
            minWidth: 340, maxWidth: 400, width: "90%", boxShadow: "0 4px 24px rgba(0,0,0,0.13)"
          }}>
            <h3 style={{ margin: "0 0 20px 0", color: "#222", fontWeight: 700 }}>Add Category</h3>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14, color: "#444" }}>
                Category Name <span style={{ color: "#b00" }}>*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={newCatName}
                onChange={(e) => { setNewCatName(e.target.value); setNewCatError(""); }}
                placeholder="Category Name"
                onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("cat-position-input")?.focus(); }}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 12px", borderRadius: 6,
                  border: newCatError ? "1.5px solid #d00" : "1.5px solid #ccc",
                  fontSize: 15
                }}
              />
              {newCatError && <div style={{ color: "#d00", fontSize: 12, marginTop: 4 }}>{newCatError}</div>}
            </div>

            {/* Position */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14, color: "#444" }}>
                Position{" "}
                <span style={{ color: "#888", fontWeight: 400 }}>
                  (1–{pendingCategories.filter(c => c.key !== "all").length + 1}, leave blank for last)
                </span>
              </label>
              <input
                id="cat-position-input"
                type="number"
                value={newCatPosition}
                onChange={(e) => setNewCatPosition(e.target.value)}
                placeholder={`${pendingCategories.filter(c => c.key !== "all").length + 1}`}
                min={1}
                max={pendingCategories.filter(c => c.key !== "all").length + 1}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmAdd(); }}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 12px", borderRadius: 6,
                  border: "1.5px solid #ccc", fontSize: 15
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 0 }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  flex: 1, background: "#eee", color: "#444", border: "none",
                  borderRadius: "0 0 0 8px", padding: "14px 0",
                  fontWeight: 600, fontSize: 15, cursor: "pointer",
                  borderTop: "1px solid #f0f0f0", borderRight: "1px solid #f0f0f0"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                style={{
                  flex: 1, background: "#2596be", color: "#fff", border: "none",
                  borderRadius: "0 0 8px 0", padding: "14px 0",
                  fontWeight: 600, fontSize: 15, cursor: "pointer",
                  borderTop: "1px solid #f0f0f0"
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Error Dialog ─────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!errorDialog}
        type="error"
        payload={{ message: errorDialog }}
        onConfirm={() => setErrorDialog("")}
        onCancel={() => setErrorDialog("")}
      />

      {/* ─── Confirm Dialog ───────────────────────────────────────────────── */}
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

const iconBtn = (disabled) => ({
  background: "none", border: "none",
  cursor:     disabled ? "not-allowed" : "pointer",
  opacity:    disabled ? 0.4 : 1,
  fontSize:   18, padding: 0, color: "#888", lineHeight: 1
});

export default CategoryManager;