import React, { useState, useEffect } from "react";

function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Go to top"
      style={{
        position:     "fixed",
        bottom:       "32px",
        right:        "32px",
        zIndex:       999,
        background:   "#2596be",
        color:        "#fff",
        border:       "none",
        borderRadius: "50%",
        width:        "44px",
        height:       "44px",
        fontSize:     "18px",
        cursor:       "pointer",
        boxShadow:    "0 2px 12px rgba(37,150,190,0.35)",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        transition:   "background 0.2s, opacity 0.2s",
        lineHeight:   1,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#1d7aa0"}
      onMouseLeave={e => e.currentTarget.style.background = "#2596be"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

export default ScrollToTop;