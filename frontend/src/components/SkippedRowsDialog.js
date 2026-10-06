import React, { useState, useEffect } from "react";

function SkippedRowsDialog({ invalidRows, onClose }) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

  const filteredRows = invalidRows.filter(row =>
    row.rowData.some(cell => String(cell).toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const paginatedRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: "100%", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#eab308" }}>⚠️ Skipped Rows</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>&times;</button>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p>The following rows were skipped because they are missing a material name:</p>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", marginBottom: 16, border: "1px solid #ccc", borderRadius: 6 }}
          />
          <div style={{ overflowX: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Row #</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Reason</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Row Data</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{row.rowNumber}</td>
                    <td style={{ padding: 8 }}>{row.reason}</td>
                    <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{row.rowData.join(" | ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
            <span>Page {currentPage} of {totalPages || 1}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
          </div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}

export default SkippedRowsDialog;