import React, { useState, useEffect } from "react";

function ImageZoomModal({ src, alt, onClose }) {
  const [zoom, setZoom]   = useState(1);
  const [drag, setDrag]   = useState({
    x: 0, y: 0, startX: 0, startY: 0, dragging: false
  });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleWheel = (e) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(5, z + (e.deltaY < 0 ? 0.2 : -0.2))));
  };

  const handleMouseDown = (e) => {
    setDrag((d) => ({ ...d, dragging: true, startX: e.clientX - d.x, startY: e.clientY - d.y }));
  };

  const handleMouseMove = (e) => {
    if (!drag.dragging) return;
    setDrag((d) => ({ ...d, x: e.clientX - d.startX, y: e.clientY - d.startY }));
  };

  const handleMouseUp = () => {
    setDrag((d) => ({ ...d, dragging: false }));
  };

  const handleReset = () => {
    setZoom(1);
    setDrag({ x: 0, y: 0, startX: 0, startY: 0, dragging: false });
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob     = await response.blob();
      const url      = window.URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = alt ? `${alt.replace(/\s+/g, "_")}.jpg` : "image.jpg";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 500);
    } catch {
      alert("Failed to download image.");
    }
  };

  return (
    <div
      style={{
        position:       "fixed",
        top:            0,
        left:           0,
        width:          "100vw",
        height:         "100vh",
        background:     "rgba(0,0,0,0.85)",
        zIndex:         3000,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        cursor:         drag.dragging ? "grabbing" : "default"
      }}
      onClick={onClose}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ─── Controls ─────────────────────────────────────────────────────── */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 16, zIndex: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.2, 5))}
          style={controlBtn}
        >
          Zoom In +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
          style={controlBtn}
        >
          Zoom Out -
        </button>
        <button onClick={handleReset} style={controlBtn}>
          Reset
        </button>
        <button onClick={handleDownload} style={controlBtn}>
          Download
        </button>
        <button onClick={onClose} style={{ ...controlBtn, background: "#d32f2f" }}>
          Close
        </button>
      </div>

      {/* ─── Image ────────────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth:       "90vw",
          maxHeight:      "80vh",
          overflow:       "hidden",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onMouseDown={handleMouseDown}
          style={{
            transform:  `scale(${zoom}) translate(${drag.x / zoom}px, ${drag.y / zoom}px)`,
            transition: drag.dragging ? "none" : "transform 0.2s",
            maxWidth:   "100%",
            maxHeight:  "80vh",
            cursor:     drag.dragging ? "grabbing" : "grab",
            userSelect: "none",
            borderRadius: 8
          }}
        />
      </div>
    </div>
  );
}

const controlBtn = {
  padding:      "8px 14px",
  borderRadius: 6,
  border:       "none",
  background:   "#2596be",
  color:        "#fff",
  fontWeight:   600,
  fontSize:     14,
  cursor:       "pointer"
};

export default ImageZoomModal;