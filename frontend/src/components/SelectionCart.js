import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import ConfirmDialog from "./ConfirmDialog";
import { exportBom } from "../services/bomService";
import { sanitizeFilename } from "../services/fileUtils";
import {
  bulkToggleHidden,
  bulkDeleteAssemblies,
  bulkDuplicateAssemblies,
} from "../services/assemblyService";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import "jspdf-autotable";

const fmtPrice = (v) =>
  v > 0
    ? `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    : "₱0.00";

// jsPDF's built-in Helvetica font does not support ₱ — use PHP prefix instead
const pdfPrice = (v) =>
  `PHP ${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SelectionCart({
  selectedIds,
  assemblies,
  quantities,
  onQuantityChange,
  onRemove,
  onClear,
  isAdmin,
  onBulkToggleHidden,
  onAssemblyClick,
  additionalMaterials = null,
  onOpenAdditionalMaterials = null,
  onClearAdditionalMaterials = null,
  onReload,
}) {
  const [downloading,   setDownloading]   = useState(false);
  const [exportLoading, setExportLoading] = useState(false); // FIX: separate state for BOM API call
  const [exportStep,    setExportStep]    = useState("");    // progress message for large exports
  const [showPopover,   setShowPopover]   = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [bulkWorking,   setBulkWorking]   = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, payload: null, onConfirm: null });
  const [isMobile,      setIsMobile]      = useState(window.innerWidth <= 768);
  const popoverRef = useRef(null);

  const selectedAssemblies = assemblies.filter((a) => selectedIds.includes(a._id));

  // ─── Format category key to readable label ────────────────────────────────
  const formatCategory = (cat) => {
    if (!cat) return "";
    return cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  };  // ─── Cart search ─────────────────────────────────────────────────────────
  const [cartSearch, setCartSearch] = useState("");
  const filteredCartAssemblies = cartSearch.trim()
    ? selectedAssemblies.filter((a) =>
        a.title.toLowerCase().includes(cartSearch.trim().toLowerCase())
      )
    : selectedAssemblies;

  // ─── Debounced quantity change ───────────────────────────────────────────
  const debounceTimers = useRef({});
  const handleDebouncedQtyChange = useCallback((id, value) => {
    if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(() => {
      onQuantityChange(id, value);
    }, 400);
  }, [onQuantityChange]);

  // ─── Compute Est. Total ──────────────────────────────────────────────────
  const computeTotalPrice = () => {
    let total = 0;
    selectedAssemblies.forEach((asm) => {
      const cartQty = quantities[asm._id] || 1;
      (asm.items || []).forEach((item) => {
        total += (Number(item.quantity) || 0) * cartQty * (item.priceAtTime || 0);
      });
    });
    if (additionalMaterials?.items) {
      additionalMaterials.items.forEach((item) => {
        total += (Number(item.quantity) || 0) * (item.priceAtTime || 0);
      });
    }
    return total;
  };
  const estTotal = computeTotalPrice();

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ─── Bulk action handlers ────────────────────────────────────────────────
  // FIX: handleBulkHide and handleBulkUnhide now call onBulkToggleHidden which
  // in turn calls onClear from the parent (HomePage), clearing selectedIds.
  // Previously the cart retained stale selections after a bulk hide/unhide.
  const handleBulkHide = () => {
    const names = selectedAssemblies.map((a) => `• ${a.title}`).join("\n");
    setConfirmDialog({
      open: true, type: "custom",
      payload: { message: `Hide ${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"}?\n\n${names}` },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        setBulkWorking(true);
        try {
          await bulkToggleHidden(selectedIds, true);
          toast.success(`${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"} hidden.`);
          setShowSettings(false);
          onBulkToggleHidden?.(true); // parent clears selectedIds + reloads
        } catch {
          toast.error("Failed to hide assemblies.");
        } finally {
          setBulkWorking(false);
        }
      }
    });
  };

  const handleBulkUnhide = () => {
    const names = selectedAssemblies.map((a) => `• ${a.title}`).join("\n");
    setConfirmDialog({
      open: true, type: "custom",
      payload: { message: `Unhide ${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"}?\n\n${names}` },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        setBulkWorking(true);
        try {
          await bulkToggleHidden(selectedIds, false);
          toast.success(`${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"} unhidden.`);
          setShowSettings(false);
          onBulkToggleHidden?.(false); // parent clears selectedIds + reloads
        } catch {
          toast.error("Failed to unhide assemblies.");
        } finally {
          setBulkWorking(false);
        }
      }
    });
  };

  const handleBulkDuplicate = () => {
    const names = selectedAssemblies.map((a) => `• ${a.title}`).join("\n");
    setConfirmDialog({
      open: true, type: "custom",
      payload: { message: `Duplicate ${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"}?\n\n${names}\n\nCopies will be created and set to visible.` },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        setBulkWorking(true);
        try {
          await bulkDuplicateAssemblies(selectedIds);
          toast.success(`${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"} duplicated.`);
          onReload?.();
        } catch {
          toast.error("Failed to duplicate assemblies.");
        } finally {
          setBulkWorking(false);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    setConfirmDialog({
      open: true, type: "delete",
      payload: { label: `${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"}` },
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        setBulkWorking(true);
        try {
          await bulkDeleteAssemblies(selectedIds);
          toast.success(`${selectedAssemblies.length} ${selectedAssemblies.length === 1 ? "assembly" : "assemblies"} deleted.`);
          onClear();
          onReload?.();
        } catch {
          toast.error("Failed to delete assemblies.");
        } finally {
          setBulkWorking(false);
        }
      }
    });
  };

  // ─── Helper: fetch BOM data with loading state ────────────────────────────
  // Supports additional-materials-only downloads (no assemblies required).
  const fetchBomData = async () => {
    // If there are no assemblies, return empty BOM structure — only additional
    // materials will be included in the export.
    if (selectedAssemblies.length === 0) {
      return { combined: [], assemblies: [] };
    }
    const payload = selectedAssemblies.map((a) => ({ id: a._id, quantity: quantities[a._id] || 1 }));
    setExportLoading(true);
    try {
      const bomData = await exportBom(payload);
      return bomData;
    } finally {
      setExportLoading(false);
    }
  };

  // ========== EXCEL EXPORT ==========
  const handleDownloadExcel = async () => {
    setShowPopover(false);
    setDownloading(true);
    setExportStep("Preparing data...");
    try {
      const workbook = new ExcelJS.Workbook();
      setExportStep("Fetching BOM data...");
      const bomData = await fetchBomData();
      const assemblyDocs = bomData.assemblies;
      const assemblyItemsMap = {};
      assemblyDocs.forEach((doc) => { assemblyItemsMap[doc.id] = doc.items; });

      const sheets = [];
      const assemblyNames = [];
      for (let idx = 0; idx < selectedAssemblies.length; idx++) {
        const asm = selectedAssemblies[idx];
        const qty = quantities[asm._id] || 1;
        const items = assemblyItemsMap[asm._id] || asm.items || [];
        const sheetName = asm.title.slice(0, 28).replace(/[\\/*?:[\]]/g, "");
        sheets.push({ id: asm._id, title: asm.title, qty, items, sheetName, image: asm.image });
        assemblyNames.push(asm.title);
      }

      const headers = ["Material", "Quantity", "Unit of Measure", "Unit Price", "Subtotal"];
      // Compute once here so it's available anywhere inside this try block
      const addMatItems = additionalMaterials?.items?.length || 0;

      // ── Only build BOM / per-assembly sheets when assemblies are selected ──
      if (selectedAssemblies.length > 0) {
        // Sheet 1: BOM Combined
        const bomSheet = workbook.addWorksheet("BOM");
        bomSheet.addRow(["BILL OF MATERIALS"]);
        bomSheet.mergeCells("A1:E1");
        const titleCell = bomSheet.getCell("A1");
        titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2596BE" } };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        bomSheet.getRow(1).height = 28;
        bomSheet.addRow([addMatItems > 0
          ? `Assemblies: ${assemblyNames.join(", ")} · Items marked [+] are Additional Materials`
          : `Assemblies: ${assemblyNames.join(", ")}`]);
        bomSheet.mergeCells("A2:E2");
        const subCell = bomSheet.getCell("A2");
        subCell.font = { italic: true, size: 10, color: { argb: "FF555555" } };
        subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
        subCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        bomSheet.getRow(2).height = 28;
        const headerRow = bomSheet.addRow(headers);
        headerRow.height = 20;
        for (let i = 0; i < headers.length; i++) {
          const cell = bomSheet.getCell(3, i + 1);
          cell.font = { bold: true, size: 11, color: { argb: "FF1D3557" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
        }
        const materialMap = new Map();
        sheets.forEach((sheet) => {
          sheet.items.forEach((item) => {
            const name = item.description || "(No Name)";
            if (!materialMap.has(name)) {
              materialMap.set(name, { description: name, unitOfMeasure: item.unitOfMeasure || "", unitPrice: item.priceAtTime || 0, sheetRefs: [], isAdditional: false });
            }
            const mat = materialMap.get(name);
            mat.unitPrice = item.priceAtTime || 0;
            mat.sheetRefs.push({ sheetId: sheet.id, sheetName: sheet.sheetName, itemQty: Number(item.quantity) || 0, cartQty: sheet.qty });
          });
        });

        // Merge additional materials into the BOM map (alphabetical together with assembly materials)
        if (addMatItems > 0) {
          additionalMaterials.items.forEach((item) => {
            const name = item.description || "(No Name)";
            if (!materialMap.has(name)) {
              materialMap.set(name, { description: name, unitOfMeasure: item.unitOfMeasure || "", unitPrice: item.priceAtTime || 0, sheetRefs: [], isAdditional: true, additionalQty: Number(item.quantity) || 0 });
            } else {
              // Name already exists from assemblies — mark it as also appearing in additional
              const mat = materialMap.get(name);
              mat.isAdditional = true;
              mat.additionalQty = Number(item.quantity) || 0;
            }
          });
        }

        const sortedMaterialEntries = [...materialMap.entries()].sort((a, b) =>
          a[0].localeCompare(b[0], undefined, { sensitivity: "base" })
        );
        let bomRowNum = 4;
        for (const [name, mat] of sortedMaterialEntries) {
          let qtyValue;
          if (mat.sheetRefs.length > 0) {
            const formulaParts = [];
            for (const ref of mat.sheetRefs) {
              const sheet = sheets.find(s => s.id === ref.sheetId);
              if (!sheet) continue;
              const sortedSheetItems = [...sheet.items].sort((a, b) =>
                (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
              );
              const itemIndex = sortedSheetItems.findIndex(i => (i.description || "(No Name)") === name);
              if (itemIndex === -1) continue;
              const rowInSheet = 3 + itemIndex;
              formulaParts.push(`'${ref.sheetName}'!B${rowInSheet}*'${ref.sheetName}'!E$1`);
            }
            // If this item also appears in additional materials, add that quantity too
            if (mat.isAdditional) formulaParts.push(String(mat.additionalQty || 0));
            qtyValue = formulaParts.length ? { formula: `SUM(${formulaParts.join(",")})` } : "0";
          } else {
            // Additional-only item — plain numeric quantity
            qtyValue = mat.additionalQty || 0;
          }
          bomSheet.getCell(`A${bomRowNum}`).value = mat.isAdditional && mat.sheetRefs.length === 0 ? `${name} [+]` : name;
          bomSheet.getCell(`B${bomRowNum}`).value = qtyValue;
          bomSheet.getCell(`C${bomRowNum}`).value = mat.unitOfMeasure;
          bomSheet.getCell(`D${bomRowNum}`).value = mat.unitPrice || "";
          bomSheet.getCell(`E${bomRowNum}`).value = mat.unitPrice ? { formula: `D${bomRowNum}*B${bomRowNum}` } : "";
          const bgColor = mat.isAdditional && mat.sheetRefs.length === 0 ? "FFFFF8E1" : ((bomRowNum - 4) % 2 === 0 ? "FFFFFFFF" : "FFF5FBFE");
          for (let col = 1; col <= 5; col++) {
            const cell = bomSheet.getCell(bomRowNum, col);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
            cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle" };
            cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
            if (col >= 4) cell.numFmt = "₱#,##0.00";
          }
          bomRowNum++;
        }
        const totalRowNum = bomRowNum;
        bomSheet.getCell(`A${totalRowNum}`).value = addMatItems > 0 ? "GRAND TOTAL (incl. Additional Materials)" : "TOTAL";
        // BOM total now covers all rows (assembly + additional merged in)
        bomSheet.getCell(`E${totalRowNum}`).value = { formula: `SUM(E4:E${totalRowNum - 1})` };
        for (let col = 1; col <= 5; col++) {
          const cell = bomSheet.getCell(totalRowNum, col);
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
          if (col >= 4) cell.numFmt = "₱#,##0.00";
        }
        bomSheet.getRow(totalRowNum).height = 20;
        bomSheet.columns = [{ width: 40 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 14 }];
      }

      // Sheet: Additional Materials (if present)
      if (additionalMaterials?.items?.length) {
        const additionalSheet = workbook.addWorksheet("Additional Materials");
        additionalSheet.addRow(["Additional Materials"]);
        additionalSheet.mergeCells("A1:E1");
        const addTitleCell = additionalSheet.getCell("A1");
        addTitleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        addTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2596BE" } };
        addTitleCell.alignment = { horizontal: "center", vertical: "middle" };
        additionalSheet.getRow(1).height = 28;
        const addHeaderRow = additionalSheet.addRow(headers);
        addHeaderRow.height = 20;
        for (let i = 0; i < headers.length; i++) {
          const cell = additionalSheet.getCell(2, i + 1);
          cell.font = { bold: true, size: 11, color: { argb: "FF1D3557" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
        }
        let addRowNum = 3;
        const sortedAddMatItems = [...additionalMaterials.items].sort((a, b) =>
          (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
        );
        sortedAddMatItems.forEach((item, idx) => {
          const unitPrice = item.priceAtTime || 0;
          additionalSheet.getCell(`A${addRowNum}`).value = item.description || "(No Name)";
          additionalSheet.getCell(`B${addRowNum}`).value = Number(item.quantity) || 0;
          additionalSheet.getCell(`C${addRowNum}`).value = item.unitOfMeasure || "";
          additionalSheet.getCell(`D${addRowNum}`).value = unitPrice || "";
          additionalSheet.getCell(`E${addRowNum}`).value = unitPrice ? { formula: `D${addRowNum}*B${addRowNum}` } : "";
          const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFF5FBFE";
          for (let col = 1; col <= 5; col++) {
            const cell = additionalSheet.getCell(addRowNum, col);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
            cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle" };
            cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
            if (col >= 4) cell.numFmt = "₱#,##0.00";
          }
          addRowNum++;
        });
        const addTotalRow = addRowNum;
        additionalSheet.getCell(`A${addTotalRow}`).value = "TOTAL";
        additionalSheet.getCell(`E${addTotalRow}`).value = { formula: `SUM(E3:E${addTotalRow - 1})` };
        for (let col = 1; col <= 5; col++) {
          const cell = additionalSheet.getCell(addTotalRow, col);
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
          if (col >= 4) cell.numFmt = "₱#,##0.00";
        }
        additionalSheet.getRow(addTotalRow).height = 20;
        additionalSheet.columns = [{ width: 40 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 14 }];
      }

      // Per-assembly sheets
      for (let s = 0; s < sheets.length; s++) {
        const sheet = sheets[s];
        const ws = workbook.addWorksheet(sheet.sheetName);

        ws.addRow([sheet.title, "", "", "", sheet.qty]);
        ws.mergeCells("A1:D1");
        const wsTitleCell = ws.getCell("A1");
        wsTitleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        wsTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2596BE" } };
        wsTitleCell.alignment = { horizontal: "center", vertical: "middle" };
        const qtyCell = ws.getCell("E1");
        qtyCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        qtyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D7A9C" } };
        qtyCell.alignment = { horizontal: "center", vertical: "middle" };
        qtyCell.numFmt = '"x"0';
        ws.getRow(1).height = 32;

        ws.addRow(headers);
        ws.getRow(2).height = 20;
        for (let i = 0; i < headers.length; i++) {
          const cell = ws.getCell(2, i + 1);
          cell.font = { bold: true, size: 11, color: { argb: "FF1D3557" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
        }

        const sortedItems = [...sheet.items].sort((a, b) =>
          (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
        );

        let rowNum = 3;
        sortedItems.forEach((item, idx) => {
          const unitPrice = item.priceAtTime || 0;
          const rawQty    = Number(item.quantity) || 0;
          ws.getCell(`A${rowNum}`).value = item.description || "(No Name)";
          ws.getCell(`B${rowNum}`).value = rawQty;
          ws.getCell(`C${rowNum}`).value = item.unitOfMeasure || "";
          ws.getCell(`D${rowNum}`).value = unitPrice || "";
          ws.getCell(`E${rowNum}`).value = unitPrice ? { formula: `D${rowNum}*B${rowNum}*E$1` } : "";
          const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFF5FBFE";
          for (let col = 1; col <= 5; col++) {
            const cell = ws.getCell(rowNum, col);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
            cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle" };
            cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
            if (col >= 4) cell.numFmt = "₱#,##0.00";
          }
          rowNum++;
        });

        const totalRow = rowNum;
        ws.getCell(`A${totalRow}`).value = "TOTAL";
        ws.getCell(`E${totalRow}`).value = { formula: `SUM(E3:E${totalRow - 1})` };
        for (let col = 1; col <= 5; col++) {
          const cell = ws.getCell(totalRow, col);
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
          cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
          cell.border = { top: { style: "medium", color: { argb: "FF2596BE" } }, bottom: { style: "medium", color: { argb: "FF2596BE" } }, left: { style: "thin" }, right: { style: "thin" } };
          if (col >= 4) cell.numFmt = "₱#,##0.00";
        }
        ws.getRow(totalRow).height = 20;
        ws.columns = [{ width: 40 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 14 }];

        if (sheet.image) {
          try {
            const response = await fetch(sheet.image);
            const blob = await response.blob();
            const img = new window.Image();
            const imgUrl = URL.createObjectURL(blob);
            const imgDims = await new Promise((resolve) => {
              img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(imgUrl); };
              img.onerror = () => resolve(null);
              img.src = imgUrl;
            });
            if (imgDims) {
              const fixedH = 200;
              let { width, height } = imgDims;
              if (height !== fixedH) { const r = fixedH / height; width = Math.round(width * r); height = fixedH; }
              const reader = new FileReader();
              const base64 = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result.split(",")[1]);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
              const ext = sheet.image.split("?")[0].split(".").pop().toLowerCase();
              const imageId = workbook.addImage({ base64, extension: ext === "jpg" ? "jpeg" : ext });
              ws.addImage(imageId, { tl: { col: 7, row: 0 }, ext: { width, height } });
            }
          } catch { /* skip image */ }
        }
      }

      const baseName = selectedAssemblies.length > 0
        ? sanitizeFilename(selectedAssemblies[0].title)
        : "Additional_Materials";
      const fileName = selectedAssemblies.length > 0
        ? `BOM_${baseName}_${new Date().toISOString().slice(0, 10)}.xlsx`
        : `Additional_Materials_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); setDownloading(false); setExportStep(""); }, 1200);
      toast.success("Excel downloaded successfully.");
    } catch (err) {
      toast.error("Failed to export Excel: " + (err?.message || err));
      setDownloading(false);
      setExportStep("");
    }
  };

  // ========== PDF EXPORT ==========
  const handleDownloadPDF = async () => {
    setShowPopover(false);
    setDownloading(true);
    setExportStep("Preparing PDF...");
    try {
      const bomData = await fetchBomData();
      const assemblyDocs = bomData.assemblies;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const margin = 16;

      const loadImageAsBase64 = (url) =>
        new Promise((resolve) => {
          fetch(url).then((r) => r.blob()).then((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }).catch(() => resolve(null));
        });

      const addMaterialsTable = (title, subtitle, items, qtyMultiplier = 1, startY) => {
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.text(title, margin, startY);
        if (subtitle) {
          doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
          doc.text(subtitle, margin, startY + 7); doc.setTextColor(0);
        }
        const rows = items.map((item) => {
          const itemQty  = Number(item.quantity)  || 0;
          const totalQty = itemQty * qtyMultiplier;
          const unitPrice  = Number(item.priceAtTime) || 0;
          const subtotal   = item.subtotal !== undefined
            ? Number(item.subtotal)
            : unitPrice * totalQty;
          return {
            description:   item.description   || "(No Name)",
            totalQty,
            unitOfMeasure: item.unitOfMeasure || "",
            unitPrice,
            subtotal,
          };
        });
        const totalAmt = rows.reduce((sum, r) => sum + r.subtotal, 0);
        const tableBody = rows.map((r) => [
          r.description,
          r.totalQty || "",
          r.unitOfMeasure,
          r.unitPrice > 0 ? pdfPrice(r.unitPrice) : "",
          r.subtotal  > 0 ? pdfPrice(r.subtotal)  : "",
        ]);
        tableBody.push(["TOTAL", "", "", "", pdfPrice(totalAmt)]);
        const totalRowIndex = tableBody.length - 1;
        doc.autoTable({
          startY: startY + (subtitle ? 16 : 12),
          margin: { left: margin, right: margin },
          head: [["Material", "Qty", "Unit of Measure", "Unit Price", "Subtotal"]],
          body: tableBody,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [37, 150, 190], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [240, 249, 255] },
          columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } },
          didParseCell: (data) => {
            if (data.section === "body" && data.row.index === totalRowIndex) {
              data.cell.styles.fontStyle  = "bold";
              data.cell.styles.fillColor  = [217, 238, 247];
              data.cell.styles.textColor  = data.column.index === 4 ? [37, 150, 190] : [29, 53, 87];
            }
          },
        });
        return doc.lastAutoTable.finalY + 8;
      };

      let y = margin + 10;
      let firstPage = true;

      // ── Only include BOM combined table when assemblies are selected ──
      if (selectedAssemblies.length > 0) {
        const combinedMap = new Map();
        for (const asm of selectedAssemblies) {
          const cartQty = quantities[asm._id] || 1;
          const items = assemblyDocs.find(d => d.id === asm._id)?.items || asm.items || [];
          items.forEach((item) => {
            const name = item.description || "(No Name)";
            const itemQty = Number(item.quantity) || 0;
            const totalQty = itemQty * cartQty;
            const unitPrice = item.priceAtTime || 0;
            if (!combinedMap.has(name)) {
              combinedMap.set(name, { description: name, quantity: 0, unitOfMeasure: item.unitOfMeasure || "", unitPrice, subtotal: 0 });
            }
            const entry = combinedMap.get(name);
            entry.quantity += totalQty;
            if (unitPrice > entry.unitPrice) entry.unitPrice = unitPrice;
          });
        }
        for (const entry of combinedMap.values()) {
          entry.subtotal = entry.unitPrice * entry.quantity;
        }
        const combinedArray = Array.from(combinedMap.values()).sort((a, b) =>
          a.description.localeCompare(b.description, undefined, { sensitivity: "base" })
        );
        const combinedItemsForTable = combinedArray.map((c) => ({
          description:   c.description,
          quantity:      c.quantity,
          unitOfMeasure: c.unitOfMeasure,
          unitPrice:     c.unitPrice,
          subtotal:      c.subtotal,
          priceAtTime:   c.unitPrice,
        }));

        let bomItemsForTable = combinedItemsForTable;
        if (additionalMaterials?.items?.length) {
          const addMatRows = additionalMaterials.items
            .filter(item => item.description?.trim())
            .map((item) => {
              const qty       = Number(item.quantity) || 0;
              const unitPrice = Number(item.priceAtTime) || 0;
              return {
                description:   (item.description || "(No Name)") + " \u2020",
                quantity:      qty,
                unitOfMeasure: item.unitOfMeasure || "",
                unitPrice,
                subtotal:      unitPrice * qty,
                priceAtTime:   unitPrice,
              };
            });
          // Merge assembly items and additional materials, then sort the whole
          // list alphabetically so the BOM combined table is one unified A→Z list.
          bomItemsForTable = [...combinedItemsForTable, ...addMatRows].sort((a, b) =>
            (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
          );
        }

        const bomSubtitle = additionalMaterials?.items?.length
          ? `Assemblies: ${selectedAssemblies.map(a => a.title).join(", ")} \u00B7 \u2020 Additional Materials included`
          : `Assemblies: ${selectedAssemblies.map(a => a.title).join(", ")}`;

        y = addMaterialsTable("Bill of Materials", bomSubtitle, bomItemsForTable, 1, y);
        firstPage = false;
      }

      // ── Additional Materials page ──
      if (additionalMaterials?.items?.length) {
        if (!firstPage) { doc.addPage(); y = margin + 10; }
        const sortedAddMat = [...additionalMaterials.items].sort((a, b) =>
          (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
        );
        y = addMaterialsTable("Additional Materials", null, sortedAddMat, 1, y);
        firstPage = false;
      }

      // ── Per-assembly pages ──
      for (const asm of selectedAssemblies) {
        const cartQty = quantities[asm._id] || 1;
        const items = assemblyDocs.find(d => d.id === asm._id)?.items || asm.items || [];
        const sortedItems = [...items].sort((a, b) =>
          (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
        );
        if (asm.image) {
          doc.addPage();
          const imgData = await loadImageAsBase64(asm.image);
          if (imgData) {
            const img = new window.Image(); img.src = imgData;
            await new Promise((res) => { img.onload = res; img.onerror = res; });
            const ratio = img.naturalWidth / img.naturalHeight;
            const maxW = pw - margin * 2; const maxH = ph - margin * 2;
            let iw = maxW, ih = maxW / ratio;
            if (ih > maxH) { ih = maxH; iw = maxH * ratio; }
            const fmt = asm.image.split("?")[0].split(".").pop().toLowerCase();
            doc.addImage(imgData, fmt === "jpg" ? "JPEG" : fmt.toUpperCase(), (pw - iw) / 2, (ph - ih) / 2, iw, ih);
          }
        }
        doc.addPage(); y = margin + 10;
        y = addMaterialsTable(`${asm.title} (x${cartQty})`, formatCategory(asm.category) || "", sortedItems, cartQty, y);
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(9); doc.setTextColor(160);
        doc.text("Bill of Materials", margin, ph - 8);
        doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 8, { align: "right" });
      }

      const baseName = selectedAssemblies.length > 0
        ? sanitizeFilename(selectedAssemblies[0].title)
        : "Additional_Materials";
      const fileName = selectedAssemblies.length > 0
        ? `BOM_${baseName}_${new Date().toISOString().slice(0, 10)}.pdf`
        : `Additional_Materials_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      toast.success("PDF downloaded successfully.");
      setDownloading(false);
      setExportStep("");
    } catch (err) {
      toast.error("Failed to export PDF: " + (err?.message || err));
      setDownloading(false);
      setExportStep("");
    }
  };

  // ─── Settings Panel (admin bulk actions overlay) ─────────────────────────
  const settingsPanel = (
    <div style={{
      position:      "fixed",
      top:           isMobile ? "auto" : 0,
      bottom:        isMobile ? 0 : "auto",
      right:         0,
      width:         isMobile ? "100vw" : 360,
      height:        isMobile ? "55vh" : "100vh",
      background:    "#fff",
      boxShadow:     isMobile ? "0 -4px 24px rgba(38,202,239,0.25)" : "-2px 0 16px rgba(38,202,239,0.13)",
      zIndex:        1000,
      display:       "flex",
      flexDirection: "column",
      borderRadius:  isMobile ? "16px 16px 0 0" : 0,
      overflow:      "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px 20px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#1d3557" }}>Admin Actions</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{selectedAssemblies.length} {selectedAssemblies.length === 1 ? "assembly" : "assemblies"} selected</div>
        </div>
        <button
          onClick={() => setShowSettings(false)}
          style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1, padding: "2px 4px" }}
          title="Close"
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Selected Assemblies
        </div>
        {selectedAssemblies.map((asm) => (
          <div key={asm._id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}>
            {asm.hidden && (
              <span style={{ fontSize: 12, background: "#fef9c3", color: "#92400e", borderRadius: 4, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>hidden</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asm.title}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleBulkHide}   disabled={bulkWorking} style={actionBtn("#6b7280")} title="Hide all selected assemblies from public view">⊘ Hide All</button>
          <button onClick={handleBulkUnhide} disabled={bulkWorking} style={actionBtn("#2596be")} title="Make all selected assemblies visible to public">👁 Unhide All</button>
        </div>
        <button onClick={handleBulkDuplicate} disabled={bulkWorking} style={{ ...actionBtn("#6366f1"), flex: "none", width: "100%", padding: "11px 0" }} title="Create a copy of each selected assembly">
          ⧉ Duplicate All ({selectedAssemblies.length})
        </button>
        <button onClick={handleBulkDelete} disabled={bulkWorking} style={{ ...actionBtn("#e11d48"), flex: "none", width: "100%", padding: "11px 0" }} title="Permanently delete all selected assemblies">
          🗑 Delete All ({selectedAssemblies.length})
        </button>
        {bulkWorking && (
          <div style={{ textAlign: "center", fontSize: 13, color: "#6b7280" }}>Working...</div>
        )}
      </div>
    </div>
  );

  // Unified download button label
  const downloadLabel = exportLoading
    ? "Fetching BOM..."
    : downloading
    ? (exportStep || "Downloading...")
    : selectedAssemblies.length > 0
    ? `Download (${selectedAssemblies.length})`
    : "Download";

  // ─── Download popover ────────────────────────────────────────────────────
  const downloadPopover = (
    <div ref={popoverRef} style={{
      position: "absolute", bottom: "110%", left: 0,
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      boxShadow: "0 4px 24px rgba(0,0,0,0.13)", padding: "14px 16px 12px 16px",
      zIndex: 1200, minWidth: 200,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>Download as</span>
        <button onClick={() => setShowPopover(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: "0 2px" }}>&times;</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={handleDownloadExcel} disabled={downloading || exportLoading} style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>Excel (.xlsx)</button>
        <button onClick={handleDownloadPDF}   disabled={downloading || exportLoading} style={{ background: "#e11d48", color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>PDF (.pdf)</button>
      </div>
    </div>
  );

  // ─── Cart items list ─────────────────────────────────────────────────────
  const cartItemsList = (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {additionalMaterials?.items?.length > 0 && (
        <div style={{ borderBottom: "1px solid #eee", padding: "10px 0", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => onOpenAdditionalMaterials?.()}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#2596be" }}>Additional Materials</div>
            <div style={{ fontSize: 12, color: "#888" }}>{additionalMaterials.items.length} custom items</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDialog({ open: true, type: "custom", payload: { message: "Clear all additional materials?" }, onConfirm: () => { onClearAdditionalMaterials?.(); setConfirmDialog({ open: false }); } }); }}
            style={{ background: "none", border: "none", color: "#e11d48", fontSize: 20, cursor: "pointer", flexShrink: 0, padding: 0 }}
            title="Remove"
          >&times;</button>
        </div>
      )}
      {selectedAssemblies.length > 5 && (
        <div style={{ padding: "8px 0 4px" }}>
          <input
            type="text"
            placeholder="Search cart..."
            value={cartSearch}
            onChange={(e) => setCartSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 10px", fontSize: 13,
              border: "1.2px solid #e5e7eb", borderRadius: 6,
              outline: "none", fontFamily: "inherit",
              color: "var(--color-text)"
            }}
          />
        </div>
      )}
      {filteredCartAssemblies.length === 0 && cartSearch && (
        <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>
          No assemblies match "{cartSearch}"
        </div>
      )}
      {filteredCartAssemblies.map((assembly) => (
        <div key={assembly._id} style={{ borderBottom: "1px solid #eee", padding: "10px 0", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{ flex: 1, minWidth: 0, cursor: "pointer", transition: "background 0.1s" }}
            onClick={() => onAssemblyClick?.(assembly)}
            onMouseEnter={(e) => e.currentTarget.style.background = "#f0f9ff"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assembly.title}</div>
            <div style={{ fontSize: 13, color: "#888" }}>{assembly.category}</div>
          </div>
          <input
            type="number"
            min={1}
            value={quantities[assembly._id] || 1}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1) {
                handleDebouncedQtyChange(assembly._id, val);
              } else if (e.target.value === "") {
                handleDebouncedQtyChange(assembly._id, 1);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 68, padding: "2px 6px", borderRadius: 4, border: "1px solid #38caef", flexShrink: 0 }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDialog({ open: true, type: "custom", payload: { message: "Remove this assembly from the selection list?" }, onConfirm: () => { onRemove(assembly._id); setConfirmDialog({ open: false }); } }); }}
            style={{ background: "none", border: "none", color: "#e11d48", fontSize: 20, cursor: "pointer", flexShrink: 0, padding: 0 }}
            title="Remove"
          >&times;</button>
        </div>
      ))}
    </div>
  );

  // ─── Bottom action bar ───────────────────────────────────────────────────
  const cartActions = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd", fontSize: 15, fontWeight: 600 }}>
        <span>Est. Total</span>
        <span style={{ color: "#2596be" }}>{fmtPrice(estTotal)}</span>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {showPopover && downloadPopover}
        <button
          onClick={() => setShowPopover((v) => !v)}
          disabled={downloading || exportLoading}
          style={{ flex: 1, background: "#2596be", color: "#fff", border: "none", borderRadius: 6, padding: "14px 0", fontWeight: 600, fontSize: 16, cursor: (downloading || exportLoading) ? "not-allowed" : "pointer", opacity: (downloading || exportLoading) ? 0.7 : 1 }}
        >
          {downloadLabel}
        </button>
        <button
          onClick={() => setConfirmDialog({ open: true, type: "custom", payload: { message: "Clear your selection list?" }, onConfirm: () => { setConfirmDialog({ open: false }); onClear(); } })}
          style={{ flex: 1, background: "#fff", color: "#e11d48", border: "1.5px solid #e11d48", borderRadius: 6, padding: "14px 0", fontWeight: 600, fontSize: 16, cursor: "pointer" }}
        >
          Clear Cart
        </button>
      </div>
    </div>
  );

  // ─── Mobile render ───────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <div style={{ position: "fixed", bottom: 0, left: 0, width: "100vw", maxHeight: "55vh", background: "#fff", boxShadow: "0 -4px 24px rgba(38,202,239,0.25)", zIndex: 999, borderRadius: "16px 16px 0 0", padding: "16px 20px 24px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#ddd" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 16, color: "#2596be" }}>Selection List</span>
              <span style={{ fontSize: 13, color: "#2596be", marginLeft: 8 }}>{selectedAssemblies.length} {selectedAssemblies.length === 1 ? "assembly" : "assemblies"}</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowSettings(true)}
                title="Admin Actions"
                style={{ background: "none", border: "1.5px solid #d1d5db", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 18, color: "#6b7280", lineHeight: 1 }}
              >
                ⚙
              </button>
            )}
          </div>
          {cartItemsList}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd", fontSize: 15, fontWeight: 600 }}>
              <span>Est. Total</span><span style={{ color: "#2596be" }}>{fmtPrice(estTotal)}</span>
            </div>
            <div style={{ display: "flex", gap: 12, position: "relative" }}>
              {showPopover && downloadPopover}
              <button onClick={() => setShowPopover((v) => !v)} disabled={downloading || exportLoading} style={{ flex: 1, background: "#2596be", color: "#fff", border: "none", borderRadius: 6, padding: "14px 0", fontWeight: 600, fontSize: 16, cursor: (downloading || exportLoading) ? "not-allowed" : "pointer", opacity: (downloading || exportLoading) ? 0.7 : 1 }}>
                {downloadLabel}
              </button>
              <button onClick={() => setConfirmDialog({ open: true, type: "custom", payload: { message: "Clear your selection list?" }, onConfirm: () => { setConfirmDialog({ open: false }); onClear(); } })} style={{ flex: 1, background: "#fff", color: "#e11d48", border: "1.5px solid #e11d48", borderRadius: 6, padding: "14px 0", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>
                Clear Cart
              </button>
            </div>
          </div>
          {showSettings && settingsPanel}
        </div>
        <ConfirmDialog open={confirmDialog.open} type={confirmDialog.type} payload={confirmDialog.payload} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog({ open: false })} />
      </>
    );
  }

  // ─── Desktop render ──────────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 360, height: "100vh", background: "#fff", boxShadow: "-2px 0 16px rgba(38,202,239,0.13)", zIndex: 999, padding: 24, display: "flex", flexDirection: "column", gap: 18, overflowY: "hidden" }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: "#2596be" }}>Selection List</h2>
          <div style={{ fontSize: 14, color: "#2596be", fontWeight: 500, marginTop: 2 }}>
            {selectedAssemblies.length} {selectedAssemblies.length === 1 ? "assembly" : "assemblies"} selected
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowSettings(true)}
            title="Admin Actions"
            style={{ background: "none", border: "1.5px solid #d1d5db", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 20, color: "#6b7280", lineHeight: 1, marginTop: 2, transition: "border-color 0.15s, color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2596be"; e.currentTarget.style.color = "#2596be"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#6b7280"; }}
          >
            ⚙
          </button>
        )}
      </div>

      {cartItemsList}
      {cartActions}

      {showSettings && settingsPanel}

      <ConfirmDialog open={confirmDialog.open} type={confirmDialog.type} payload={confirmDialog.payload} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog({ open: false })} />
    </div>
  );
}

const actionBtn = (color) => ({
  flex:         1,
  background:   "none",
  border:       `1.5px solid ${color}`,
  borderRadius: 6,
  color:        color,
  fontWeight:   600,
  fontSize:     14,
  padding:      "10px 0",
  cursor:       "pointer",
  transition:   "background 0.15s",
});

export default SelectionCart;