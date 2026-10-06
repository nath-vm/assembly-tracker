import React from "react";

function ImportResultDialog({ result, onClose }) {
  const {
    imported      = 0,
    overwritten   = 0,
    skipped       = 0,
    autoSkipped   = 0,
    invalid       = 0,
    failed        = 0,
    assembliesUpdated = 0,
  } = result;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, width: "100%", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#16a34a"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <h3 style={{ margin: 0, color: "#1d3557" }}>Import Complete</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#9ca3af" }}>&times;</button>
        </div>
        <div style={{ padding: "20px" }}>
          {imported > 0 && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span><strong>{imported}</strong> new material{imported !== 1 ? "s" : ""} imported</span>
            </div>
          )}
          {overwritten > 0 && (
            <>
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>♻️</span>
                <span><strong>{overwritten}</strong> material{overwritten !== 1 ? "s" : ""} overwritten</span>
              </div>
              {assembliesUpdated > 0 && (
                <div style={{ marginBottom: 10, marginLeft: 28, color: "#2596be", fontSize: 13 }}>
                  🔁 <strong>{assembliesUpdated}</strong> {assembliesUpdated === 1 ? "assembly" : "assemblies"} synced
                </div>
              )}
            </>
          )}
          {skipped > 0 && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⏭️</span>
              <span><strong>{skipped}</strong> duplicate{skipped !== 1 ? "s" : ""} skipped (manual decision)</span>
            </div>
          )}
          {autoSkipped > 0 && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🟰</span>
              <span><strong>{autoSkipped}</strong> identical record{autoSkipped !== 1 ? "s" : ""} auto-skipped (no changes)</span>
            </div>
          )}
          {invalid > 0 && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ color: "#b45309" }}><strong>{invalid}</strong> row{invalid !== 1 ? "s" : ""} skipped (missing name)</span>
            </div>
          )}
          {failed > 0 && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>❌</span>
              <span style={{ color: "#dc2626" }}><strong>{failed}</strong> row{failed !== 1 ? "s" : ""} failed</span>
            </div>
          )}
          {imported === 0 && overwritten === 0 && (
            <div style={{ color: "#6b7280", fontSize: 14 }}>No records were imported.</div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", textAlign: "right" }}>
          <button onClick={onClose} className="btn-primary">Done</button>
        </div>
      </div>
    </div>
  );
}

export default ImportResultDialog;