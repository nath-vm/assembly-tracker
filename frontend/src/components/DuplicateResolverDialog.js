import React, { useState, useEffect } from "react";

function DuplicateResolverDialog({ duplicates, existingMap, onResolve }) {
  const [globalAction, setGlobalAction] = useState("skip");
  const [overrides, setOverrides] = useState({});
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const filteredDuplicates = duplicates.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.existing?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredDuplicates.length / rowsPerPage);
  const paginated = filteredDuplicates.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const getActionForRow = (rowName) => {
    if (overrides[rowName] !== undefined) return overrides[rowName];
    return globalAction;
  };

  const handleGlobalChange = (action) => {
    setGlobalAction(action);
  };

  const handleRowChange = (rowName, action) => {
    setOverrides(prev => ({ ...prev, [rowName]: action }));
  };

  const handleConfirm = () => {
    const decisions = {};
    duplicates.forEach(d => {
      decisions[d.name] = getActionForRow(d.name);
    });
    onResolve(decisions);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal" style={{ maxWidth: 1000, width: "100%", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, color: "#2596be" }}>Duplicate Materials Found</h3>
          <button onClick={() => onResolve({})} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>&times;</button>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center" }}>
            <span>Global default:</span>
            <label><input type="radio" name="global" value="skip" checked={globalAction === "skip"} onChange={() => handleGlobalChange("skip")} /> Skip All</label>
            <label><input type="radio" name="global" value="overwrite" checked={globalAction === "overwrite"} onChange={() => handleGlobalChange("overwrite")} /> Overwrite All</label>
          </div>
          <input
            type="text"
            placeholder="Search materials..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", marginBottom: 16, border: "1px solid #ccc", borderRadius: 6 }}
          />
          <div style={{ overflowX: "auto", maxHeight: 500 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Material Name</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Existing Record</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Incoming Record</th>
                  <th style={{ padding: 8, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(d => (
                  <tr key={d.name} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}><strong>{d.name}</strong></td>
                    <td style={{ padding: 8 }}>
                      {d.existing?.unitOfMeasure || "-"}<br/>
                      ₱{d.existing?.price?.toFixed(2) || "0.00"}
                    </td>
                    <td style={{ padding: 8 }}>
                      {d.incoming.unitOfMeasure || "-"}<br/>
                      ₱{d.incoming.price?.toFixed(2) || "0.00"}
                    </td>
                    <td style={{ padding: 8, textAlign: "center" }}>
                      <select value={getActionForRow(d.name)} onChange={e => handleRowChange(d.name, e.target.value)} style={{ padding: "4px 8px" }}>
                        <option value="skip">Skip</option>
                        <option value="overwrite">Overwrite</option>
                      </select>
                    </td>
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
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={() => onResolve({})} className="btn-secondary">Cancel</button>
          <button onClick={handleConfirm} className="btn-primary">Confirm Import</button>
        </div>
      </div>
    </div>
  );
}

export default DuplicateResolverDialog;