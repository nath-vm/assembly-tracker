import React, { useState } from "react";

const FILTER_OPTIONS = [
  { value: "all",         label: "All"           },
  { value: "title",       label: "Title"         },
  { value: "description", label: "Material Name" }
];

function SearchBar({ onSearch }) {
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState("all");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ query, filter });
  };

  const handleClear = () => {
    setQuery("");
    setFilter("all");
    onSearch({ query: "", filter: "all" });
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!val) {
      setFilter("all");
      onSearch({ query: "", filter: "all" });
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 0, alignItems: "center" }}>
      <div className="form__group field search-field" style={{ position: "relative", flex: "1 1 65px", minWidth: 0, marginBottom: 0 }}>
        <input
          type="text"
          className="form__field"
          placeholder="Search..."
          value={query}
          onChange={handleChange}
          style={{ paddingRight: query ? "2rem" : undefined }}
        />
        <label className="form__label">Search</label>

        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            style={{
              position:   "absolute",
              right:      "0.5rem",
              top:        "50%",
              transform:  "translateY(-50%)",
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    "0 4px",
              fontSize:   "1rem",
              lineHeight: 1,
              color:      "#888",
              display:    "flex",
              alignItems: "center",
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="search-controls" style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 0 auto" }}>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding:      "7px 10px",
            borderRadius: 6,
            border:       "1px solid #ccc",
            fontSize:     15,
            width:        140
          }}
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button type="submit" className="btn-primary" style={{ whiteSpace: "nowrap" }}>
          Search
        </button>
      </div>
    </form>
  );
}

export default SearchBar;