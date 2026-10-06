import React from "react";

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      let start = Math.max(2, page - 1);
      let end   = Math.min(totalPages - 1, page + 1);
      if (page <= 3) end = 4;
      if (page >= totalPages - 2) start = totalPages - 3;
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="pagination">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        &lt;
      </button>

      {getPages().map((p, idx) =>
        p === "..." ? (
          <span key={`ellipsis-${idx}`} style={{
            minWidth:   24,
            textAlign:  "center",
            color:      "#aaa",
            fontWeight: 700,
            fontSize:   18,
            userSelect: "none"
          }}>
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={page === p ? "active" : ""}
            style={{ fontWeight: page === p ? "bold" : "normal" }}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        &gt;
      </button>
    </div>
  );
}

export default Pagination;