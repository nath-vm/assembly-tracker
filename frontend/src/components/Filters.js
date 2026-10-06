import React from "react";

function Filters({
  categories = [],
  selectedCategory,
  onCategoryChange,
  isAdmin,
  showHidden,
  onToggleHidden,
  categoryCounts,
  totalCount,
  activeCount,
  hiddenCount,
  sortOrder,
  onSortChange,
  onOpenAdditionalMaterials,
}) {
  const sorted = [...categories]
    .filter((c) => !c.hidden)
    .sort((a, b) => {
      if (a.key === "all") return -1;
      if (b.key === "all") return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="filters">
        <div className="filters-inner">
          <button
            className={`filter-btn ${!selectedCategory || selectedCategory === "all" ? "active" : ""}`}
            onClick={() => onCategoryChange("all")}
          >
            All
            {totalCount > 0 && <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 500, opacity: 0.75 }}>({totalCount})</span>}
          </button>
          {sorted.filter((c) => c.key !== "all").map((c) => (
            <button
              key={c.key}
              className={`filter-btn ${selectedCategory === c.key ? "active" : ""}`}
              onClick={() => onCategoryChange(c.key)}
            >
              {c.label}
              {categoryCounts?.[c.key] > 0 && (
                <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 500, opacity: 0.75 }}>({categoryCounts[c.key]})</span>
              )}
            </button>
          ))}
        </div>
      </div>
      
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            onClick={onOpenAdditionalMaterials}
            style={{
              background: "var(--color-primary-bg-alt)",
              color: "var(--color-primary)",
              border: "1.5px solid var(--color-primary-light)",
              borderRadius: 18,
              padding: "4px 14px",
              fontSize: 13,
              fontWeight: 600,
              height: 36,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Materials
          </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {isAdmin && totalCount > 0 && (
            <>
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Total: <strong style={{ color: "var(--color-muted-dark)" }}>{totalCount}</strong></span>
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Active: <strong style={{ color: "var(--color-success)" }}>{activeCount}</strong></span>
              <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Hidden: <strong style={{ color: hiddenCount > 0 ? "var(--color-warning)" : "var(--color-muted-dark)" }}>{hiddenCount}</strong></span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={sortOrder} onChange={(e) => onSortChange(e.target.value)} style={{
            padding: "4px 14px 4px 10px", borderRadius: 18,
            border: "1.2px solid var(--color-primary-light)", fontSize: 13,
            color: "var(--color-primary)", background: "var(--color-primary-bg)",
            cursor: "pointer", outline: "none",
            fontFamily: "Segoe UI, sans-serif", fontWeight: 500, height: 36,
            boxSizing: "border-box", appearance: "none", WebkitAppearance: "none",
            paddingRight: 28
          }}>
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          <button
            className="hidden-toggle"
            onClick={() => onToggleHidden(!showHidden)}
            style={{
              background: showHidden ? "var(--color-warning)" : undefined,
              color: showHidden ? "var(--color-white)" : undefined,
              borderColor: showHidden ? "var(--color-warning)" : undefined,
              marginBottom: 0,
              height: 36,
            }}
          >
            <span style={{ fontSize: 16 }}>{showHidden ? "⊘" : "○"}</span>
            {showHidden ? "Showing Hidden" : "Show Hidden"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Filters;