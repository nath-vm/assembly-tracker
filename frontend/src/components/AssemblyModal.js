import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import ImageZoomModal from "./ImageZoomModal";
import ConfirmDialog from "./ConfirmDialog";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { sanitizeFilename } from "../services/fileUtils";

function AssemblyModal({
  assembly,
  isAuthenticated,
  quantity,
  onQuantityChange,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleHidden,
  onReload
}) {
  const popoverRef  = useRef(null);
  const [zoomImage,     setZoomImage]     = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, payload: null, onConfirm: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [showPopover,   setShowPopover]   = useState(false);

  const cartQty = quantity || 1;

  const formatCategory = (cat) => {
    if (!cat) return "";
    return cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  };

  const fmtPrice = (v) =>
    v > 0
      ? `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
      : "";

  // ─── ESC to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (confirmDialog.open) setConfirmDialog({ open: false });
        else if (zoomImage)     setZoomImage(null);
        else if (showPopover)   setShowPopover(false);
        else                    onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmDialog.open, zoomImage, showPopover, onClose]);

  // ─── Duplicate ─────────────────────────────────────────────────────────────
  const handleDuplicate = () => {
    setConfirmDialog({
      open:      true,
      type:      "custom",
      payload:   { message: "Duplicate this assembly?" },
      onConfirm: async () => {
        setActionLoading(true);
        try { await onDuplicate(); setConfirmDialog({ open: false }); onClose(); }
        catch { /* fail silently */ }
        setActionLoading(false);
      }
    });
  };

  // ─── Toggle Hidden ─────────────────────────────────────────────────────────
  const handleToggleHidden = () => {
    const hiding = !assembly.hidden;
    setConfirmDialog({
      open:      true,
      type:      "custom",
      payload:   { message: `${hiding ? "Hide" : "Unhide"} this assembly?` },
      onConfirm: async () => {
        setActionLoading(true);
        try { await onToggleHidden(); setConfirmDialog({ open: false }); onClose(); }
        catch { /* fail silently */ }
        setActionLoading(false);
      }
    });
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    setConfirmDialog({
      open:      true,
      type:      "delete",
      payload:   { label: assembly.title },
      onConfirm: async () => {
        setActionLoading(true);
        try { await onDelete(); setConfirmDialog({ open: false }); onClose(); }
        catch { /* fail silently */ }
        setActionLoading(false);
      }
    });
  };

  // ─── Download PDF ──────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const doc    = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw     = doc.internal.pageSize.getWidth();
      const ph     = doc.internal.pageSize.getHeight();
      const margin = 16;
      const qty    = cartQty;

      // jsPDF built-in Helvetica does not support ₱ — use PHP prefix
      const pdfPrice = (v) =>
        v > 0
          ? `PHP ${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "";

      const loadImageAsBase64 = (url) =>
        new Promise((resolve) => {
          fetch(url)
            .then((r) => r.blob())
            .then((blob) => {
              const reader     = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror   = () => resolve(null);
              reader.readAsDataURL(blob);
            })
            .catch(() => resolve(null));
        });

      // Page 1 — full page image
      if (assembly.image) {
        const imgData = await loadImageAsBase64(assembly.image);
        if (imgData) {
          const img = new window.Image();
          img.src   = imgData;
          await new Promise((res) => { img.onload = res; img.onerror = res; });
          const ratio = img.naturalWidth / img.naturalHeight;
          const maxW  = pw - margin * 2;
          const maxH  = ph - margin * 2;
          let iw = maxW, ih = maxW / ratio;
          if (ih > maxH) { ih = maxH; iw = maxH * ratio; }
          const fmt = assembly.image.split("?")[0].split(".").pop().toLowerCase();
          doc.addImage(imgData, fmt === "jpg" ? "JPEG" : fmt.toUpperCase(), (pw - iw) / 2, (ph - ih) / 2, iw, ih);
          doc.addPage();
        }
      }

      // Page 2 — materials table matching multi-assembly BOM style
      const startY = margin + 10;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`${assembly.title}${qty > 1 ? ` (x${qty})` : ""}`, margin, startY);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(formatCategory(assembly.category) || "", margin, startY + 7);
      doc.setTextColor(0);

      const sortedItems = [...assembly.items].sort((a, b) =>
        (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
      );

      const tableBody = sortedItems.map((item) => {
        const itemQty   = item.quantity !== "" && item.quantity !== undefined
          ? Number(item.quantity) * qty
          : "";
        const unitPrice = Number(item.priceAtTime) || 0;
        const subtotal  = unitPrice && itemQty !== "" ? unitPrice * itemQty : 0;
        return [
          item.description || "(No Name)",
          itemQty || "",
          item.unitOfMeasure || "",
          unitPrice > 0 ? pdfPrice(unitPrice) : "",
          subtotal  > 0 ? pdfPrice(subtotal)  : ""
        ];
      });

      const totalAmt = sortedItems.reduce((s, item) => {
        const iq = item.quantity !== "" && item.quantity !== undefined
          ? Number(item.quantity) * qty : 0;
        return s + (Number(item.priceAtTime) || 0) * iq;
      }, 0);
      tableBody.push(["TOTAL", "", "", "", pdfPrice(totalAmt)]);
      const totalRowIndex = tableBody.length - 1;

      doc.autoTable({
        startY:             startY + 16,
        margin:             { left: margin, right: margin },
        head:               [["Material", "Qty", "Unit of Measure", "Unit Price", "Subtotal"]],
        body:               tableBody,
        styles:             { fontSize: 9, cellPadding: 3 },
        headStyles:         { fillColor: [37, 150, 190], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [240, 249, 255] },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "center" },
          3: { halign: "right" },
          4: { halign: "right" }
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === totalRowIndex) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [217, 238, 247];
            data.cell.styles.textColor = data.column.index === 4 ? [37, 150, 190] : [29, 53, 87];
          }
        }
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(160);
        doc.text(assembly.title, margin, ph - 8);
        doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 8, { align: "right" });
      }

      const fileName = `${sanitizeFilename(assembly.title)}_materials_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
      toast.success("PDF downloaded successfully.");
      setDownloading(false);
    } catch {
      setDownloading(false);
    }
  };

  // ─── Download Excel ────────────────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      const workbook  = new ExcelJS.Workbook();
      const sheetName = assembly.title?.slice(0, 28).replace(/[\\/*?:[\]]/g, "") || "Assembly";
      const ws        = workbook.addWorksheet(sheetName);
      const qty       = cartQty;

      const headers = ["Material", "Quantity", "Unit of Measure", "Unit Price", "Subtotal"];

      // Title row: assembly name + qty multiplier in E1
      ws.addRow([assembly.title, "", "", "", qty]);
      ws.mergeCells("A1:D1");
      const wsTitleCell = ws.getCell("A1");
      wsTitleCell.font      = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      wsTitleCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2596BE" } };
      wsTitleCell.alignment = { horizontal: "center", vertical: "middle" };
      const qtyCell         = ws.getCell("E1");
      qtyCell.font          = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      qtyCell.fill          = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D7A9C" } };
      qtyCell.alignment     = { horizontal: "center", vertical: "middle" };
      qtyCell.numFmt        = '"x"0';
      ws.getRow(1).height   = 32;

      // Header row
      ws.addRow(headers);
      ws.getRow(2).height = 20;
      for (let i = 0; i < headers.length; i++) {
        const cell      = ws.getCell(2, i + 1);
        cell.font       = { bold: true, size: 11, color: { argb: "FF1D3557" } };
        cell.fill       = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
        cell.alignment  = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
        cell.border     = {
          top:    { style: "medium", color: { argb: "FF2596BE" } },
          bottom: { style: "medium", color: { argb: "FF2596BE" } },
          left:   { style: "thin" }, right: { style: "thin" }
        };
      }

      // Sort items alphabetically (matching multi-assembly sheet style)
      const sortedItems = [...assembly.items].sort((a, b) =>
        (a.description || "").localeCompare(b.description || "", undefined, { sensitivity: "base" })
      );

      // Data rows
      const DATA_START = 3;
      sortedItems.forEach((item, idx) => {
        const rawQty    = item.quantity !== "" && item.quantity !== undefined
          ? Number(item.quantity)
          : 0;
        const unitPrice = item.priceAtTime || 0;
        const rowNum    = DATA_START + idx;
        const bgColor   = idx % 2 === 0 ? "FFFFFFFF" : "FFF5FBFE";

        ws.getCell(`A${rowNum}`).value = item.description || "(No Name)";
        ws.getCell(`B${rowNum}`).value = rawQty;
        ws.getCell(`C${rowNum}`).value = item.unitOfMeasure || "";
        ws.getCell(`D${rowNum}`).value = unitPrice || "";
        // E column = D * B * qty-multiplier in E1
        ws.getCell(`E${rowNum}`).value = unitPrice ? { formula: `D${rowNum}*B${rowNum}*E$1` } : "";

        ws.getRow(rowNum).height = 17;
        ["A", "B", "C", "D", "E"].forEach((col, i) => {
          const cell      = ws.getCell(`${col}${rowNum}`);
          cell.fill       = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
          cell.alignment  = { horizontal: i === 0 ? "left" : "center", vertical: "middle" };
          cell.border = {
            top:    { style: "thin", color: { argb: "FFD1D5DB" } },
            bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
            left:   { style: "thin", color: { argb: "FFD1D5DB" } },
            right:  { style: "thin", color: { argb: "FFD1D5DB" } }
          };
          if (i >= 3) cell.numFmt = "₱#,##0.00";
        });
      });

      // Total row
      const totalRow = DATA_START + sortedItems.length;
      ["A", "B", "C", "D", "E"].forEach((col, i) => {
        const cell = ws.getCell(`${col}${totalRow}`);
        if (i === 0) cell.value = "TOTAL";
        if (i === 4) cell.value = { formula: `SUM(E${DATA_START}:E${totalRow - 1})` };
        cell.font      = { bold: true, size: 11, color: { argb: i === 4 ? "FF2596BE" : "FF1D3557" } };
        cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EEF7" } };
        cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
        cell.border    = {
          top:    { style: "medium", color: { argb: "FF2596BE" } },
          bottom: { style: "medium", color: { argb: "FF2596BE" } },
          left:   { style: "thin" }, right: { style: "thin" }
        };
        if (i >= 3) cell.numFmt = "₱#,##0.00";
      });
      ws.getRow(totalRow).height = 20;

      // Column widths
      ws.columns = [
        { width: Math.max(30, ...assembly.items.map((i) => (i.description || "").length)) },
        { width: 12 }, { width: 18 }, { width: 14 }, { width: 14 }
      ];

      // Embed assembly image to the right of the table
      if (assembly.image) {
        try {
          const response  = await fetch(assembly.image);
          const blob      = await response.blob();
          const imgEl     = new window.Image();
          const imgUrl    = URL.createObjectURL(blob);
          const imgDims   = await new Promise((resolve, reject) => {
            imgEl.onload  = () => { resolve({ width: imgEl.naturalWidth, height: imgEl.naturalHeight }); URL.revokeObjectURL(imgUrl); };
            imgEl.onerror = reject;
            imgEl.src     = imgUrl;
          });
          const fixedH = 200;
          let { width, height } = imgDims;
          if (height !== fixedH) { const r = fixedH / height; width = Math.round(width * r); height = fixedH; }
          const reader = new FileReader();
          const base64 = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
          });
          const ext     = assembly.image.split("?")[0].split(".").pop().toLowerCase();
          const imageId = workbook.addImage({ base64, extension: ext === "jpg" ? "jpeg" : ext });
          ws.addImage(imageId, { tl: { col: 7, row: 0 }, ext: { width, height } });
        } catch { /* skip image */ }
      }

      const buffer   = await workbook.xlsx.writeBuffer();
      const blob     = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url      = window.URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = `${sanitizeFilename(assembly.title)}_materials_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); setDownloading(false); }, 1200);
      toast.success("Excel downloaded successfully.");
    } catch {
      setDownloading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
        >

          {/* ─── Sticky Header ──────────────────────────────────────────────── */}
          <div style={{
            position:     "sticky",
            top:          0,
            zIndex:       10,
            background:   "#fff",
            borderBottom: "1px solid #e5e7eb",
            padding:      "10px 20px",
            boxShadow:    "0 2px 8px rgba(0,0,0,0.06)",
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            flexWrap:     "wrap",
          }}>
            {isAuthenticated && (
              <>
                <button className="btn-primary"   onClick={onEdit}          disabled={actionLoading} style={{ whiteSpace: "nowrap" }}>Edit</button>
                <button className="btn-secondary" onClick={handleDuplicate} disabled={actionLoading} style={{ whiteSpace: "nowrap" }}>Duplicate</button>
                <button
                  onClick={handleToggleHidden}
                  disabled={actionLoading}
                  style={{
                    background:   assembly.hidden ? "#6b7280" : "#eab308",
                    color:        "#fff",
                    border:       "none",
                    borderRadius: 6,
                    padding:      "8px 16px",
                    fontWeight:   600,
                    fontSize:     15,
                    minHeight:    36,
                    cursor:       "pointer",
                    whiteSpace:   "nowrap",
                    opacity:      actionLoading ? 0.6 : 1
                  }}
                >
                  {assembly.hidden ? "Unhide" : "Hide"}
                </button>
                <button className="btn-danger" onClick={handleDelete} disabled={actionLoading} style={{ whiteSpace: "nowrap" }}>Delete</button>
                <div style={{ width: 1, height: 24, background: "#e5e7eb", flexShrink: 0 }} />
              </>
            )}

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ position: "relative" }} ref={popoverRef}>
                <button
                  className="btn-secondary"
                  onClick={() => setShowPopover((v) => !v)}
                  disabled={downloading}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {downloading ? "Downloading..." : "Download"}
                </button>
                {showPopover && (
                  <div style={{
                    position:     "absolute",
                    top:          "110%",
                    right:        0,
                    background:   "#fff",
                    border:       "1px solid #e5e7eb",
                    borderRadius: 10,
                    boxShadow:    "0 4px 24px rgba(0,0,0,0.13)",
                    padding:      "14px 16px 12px 16px",
                    zIndex:       1200,
                    minWidth:     200
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>Download as</span>
                      <button onClick={() => setShowPopover(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1, padding: "0 2px" }}>&times;</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button onClick={() => { setShowPopover(false); handleDownloadExcel(); }} disabled={downloading} style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>Excel (.xlsx)</button>
                      <button onClick={() => { setShowPopover(false); handleDownloadPDF(); }} disabled={downloading} style={{ background: "#e11d48", color: "#fff", border: "none", borderRadius: 6, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>PDF (.pdf)</button>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>Qty x</span>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => onQuantityChange(e.target.value)}
                  title="Quantity multiplier"
                  style={{
                    width:        50,
                    padding:      "4px 6px",
                    borderRadius: 5,
                    border:       "1px solid #38caef",
                    background:   "#38caef",
                    color:        "#fff",
                    fontWeight:   600,
                    fontSize:     15,
                    textAlign:    "center"
                  }}
                />
              </div>
              <button onClick={onClose} title="Close (ESC)" style={{ background: "none", border: "none", color: "#d32f2f", fontSize: 28, fontWeight: 700, cursor: "pointer", lineHeight: 1, flexShrink: 0, minHeight: "unset", padding: "0 4px" }}>&times;</button>
            </div>
          </div>

          {/* ─── Scrollable Body – TWO-LINE LAYOUT ────────────────────────────── */}
          <div style={{ overflowY: "auto", flex: 1, padding: "20px 28px 28px 28px" }}>
            <h2 style={{ marginTop: 0 }}>{assembly.title}</h2>
            <p><strong>Category:</strong> {formatCategory(assembly.category)}</p>
            {isAuthenticated && (
              <p style={{ fontSize: 13, color: "#888", margin: "4px 0 12px" }}>
                Status: {assembly.hidden ? <b style={{ color: "#eab308" }}>Hidden</b> : <b style={{ color: "#32CD32" }}>Visible</b>}
              </p>
            )}
            {assembly.image && (
              <div style={{ margin: "12px 0" }}>
                <img
                  src={assembly.image}
                  alt={assembly.title}
                  style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, border: "1px solid #ccc", cursor: "zoom-in" }}
                  onClick={() => setZoomImage(assembly.image)}
                />
              </div>
            )}

            <h3 style={{ marginBottom: 12 }}>Materials</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {assembly.items.map((item, idx) => {
                  const itemQty   = item.quantity !== "" && item.quantity !== undefined
                    ? Number(item.quantity)
                    : 1;
                  const totalQty  = itemQty * cartQty;
                  const unitPrice = item.priceAtTime || 0;
                  const subtotal  = unitPrice * totalQty;

                  // Line 1: Number + Item Code - Material Name
                  const numberDisplay = `${idx + 1}. `;
                  const nameLine = item.code ? `${numberDisplay}${item.code} - ${item.description}` : `${numberDisplay}${item.description}`;

                  return (
                    <div key={idx} style={{ paddingBottom: 8, borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{nameLine}</div>
                      <div style={{ marginTop: 6, fontSize: 14, color: "#333" }}>
                        {totalQty} {item.unitOfMeasure}
                        {unitPrice > 0 && (
                          <span style={{ marginLeft: 12, color: "#2596be" }}>
                            @ {fmtPrice(unitPrice)} = {fmtPrice(subtotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            {/* Estimated Total */}
            {(() => {
              const total = assembly.items.reduce((sum, item) => {
                const itemQty = item.quantity !== "" && item.quantity !== undefined
                  ? Number(item.quantity) : 1;
                return sum + (item.priceAtTime || 0) * itemQty * cartQty;
              }, 0);
              return total > 0 ? (
                <div style={{
                  marginTop: 24, padding: "10px 14px",
                  background: "#f0f9ff", borderRadius: 8,
                  border: "1px solid #bae6fd",
                  display: "flex", justifyContent: "space-between",
                  fontSize: 15, fontWeight: 600
                }}>
                  <span>Est. Total{cartQty > 1 ? ` (×${cartQty})` : ""}</span>
                  <span style={{ color: "#2596be" }}>{fmtPrice(total)}</span>
                </div>
              ) : null;
            })()}

            {assembly.updatedAt && (
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 20, marginBottom: 0 }}>
                Last updated:{" "}
                {new Date(assembly.updatedAt).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric"
                })}
              </p>
            )}
          </div>

        </div>
      </div>

      {zoomImage && (
        <ImageZoomModal src={zoomImage} alt={assembly.title} onClose={() => setZoomImage(null)} />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        type={confirmDialog.type}
        payload={confirmDialog.payload}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false })}
      />
    </>
  );
}

export default AssemblyModal;