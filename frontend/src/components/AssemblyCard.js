import React from "react";

function AssemblyCard({ assembly, isSelected, showHidden, onSelect, onView, onEdit, onDelete, onToggleHidden, onDuplicate }) {
  const formatCategory = (cat) => {
    if (!cat) return "";
    return cat.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  };

  return (
    <div
      className="card"
      style={{
        position:       "relative",
        minHeight:      220,
        opacity:        assembly.hidden && showHidden ? 0.7 : 1,
        display:        "flex",
        flexDirection:  "column",
      }}
    >
      {/* ─── Hidden Badge ─────────────────────────────────────────────────── */}
      {showHidden && assembly.hidden && (
        <span style={{
          position:       "absolute",
          top:            10,
          right:          10,
          zIndex:         2,
          background:     "rgba(234,179,8,0.95)",
          color:          "#fff",
          borderRadius:   "50%",
          width:          34,
          height:         34,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          boxShadow:      "0 2px 8px rgba(234,179,8,0.18)",
          border:         "2px solid #fff",
          fontSize:       18
        }} title="Hidden">
          ⊘
        </span>
      )}

      {/* ─── Image or Placeholder ─────────────────────────────────────────── */}
      {assembly.image ? (
        <img
          src={assembly.image}
          alt={assembly.title}
          style={{
            width:        "100%",
            height:       140,
            objectFit:    "cover",
            borderRadius: 8,
            marginBottom: 8,
            display:      "block",
            flexShrink:   0,
          }}
        />
      ) : (
        <div style={{
          width:          "100%",
          height:         140,
          borderRadius:   8,
          marginBottom:   8,
          background:     "linear-gradient(135deg, #f0f4f8 0%, #e2eaf0 100%)",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          color:          "#90a4ae",
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#90a4ae" strokeWidth="1.2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span style={{ fontSize: 11, marginTop: 6, letterSpacing: 1 }}>NO IMAGE</span>
        </div>
      )}

      {/* ─── Content ──────────────────────────────────────────────────────── */}
      <div className="card-content" style={{ flex: 1 }}>
        <h3>{assembly.title}</h3>
        <p className="category">{formatCategory(assembly.category)}</p>
        {assembly.items?.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--color-muted-dark)", margin: "4px 0 0", fontWeight: 500 }}>
            {assembly.items.length} {assembly.items.length === 1 ? "material" : "materials"}
          </p>
        )}
      </div>

      {/* ─── Actions (always pinned to bottom) ────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto" }}>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="card-checkbox"
          title="Select for download"
          style={{ margin: 0, width: 18, height: 18, accentColor: "#38caef" }}
        />

        {/* View */}
        <button
          className="view-btn"
          style={{ flex: 1 }}
          onClick={(e) => { e.stopPropagation(); onView?.(); }}
        >
          View Details
        </button>
      </div>
    </div>
  );
}

export default AssemblyCard;  