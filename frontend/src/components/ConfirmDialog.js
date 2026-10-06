import React from "react";

function ConfirmDialog({ open, type, payload, onConfirm, onCancel }) {
  if (!open) return null;

  let message      = "Are you sure?";
  let confirmLabel = "Confirm";
  let confirmColor = "#2596be";
  let showCancel   = true;

  if (payload?.message) {
    message = payload.message;
  } else if (type === "delete") {
    message      = `Are you sure you want to delete ${payload?.label || "this item"}?`;
    confirmLabel = "Delete";
    confirmColor = "#d32f2f";
  } else if (type === "cancel") {
    message      = "Are you sure you want to discard your changes?";
    confirmLabel = "Discard";
    confirmColor = "#d32f2f";
  } else if (type === "save") {
    message      = "Are you sure you want to save these changes?";
    confirmLabel = "Save";
    confirmColor = "#2596be";
  } else if (type === "unsaved") {
    message      = "You have unsaved changes. Save before leaving?";
    confirmLabel = "Save & Continue";
    confirmColor = "#2596be";
  } else if (type === "error") {
    message      = payload?.message || "An error occurred.";
    confirmLabel = "OK";
    confirmColor = "#d32f2f";
    showCancel   = false;
  } else if (type === "custom") {
    message      = payload?.message || "Are you sure?";
    confirmLabel = "Confirm";
    confirmColor = "#2596be";
  }

  return (
    <div style={{
      position:       "fixed",
      top:            0,
      left:           0,
      width:          "100vw",
      height:         "100vh",
      background:     "rgba(0,0,0,0.2)",
      zIndex:         2000,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center"
    }}>
      <div style={{
        background:   "#fff",
        borderRadius: 8,
        padding:      32,
        minWidth:     320,
        maxWidth:     400,
        boxShadow:    "0 2px 16px rgba(0,0,0,0.15)"
      }}>
        <div style={{
          marginBottom: 18,
          textAlign:    "center",
          color:        type === "error" ? "#d32f2f" : "#222",
          fontWeight:   type === "error" ? 600 : 400
        }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 0, width: "100%" }}>
          {showCancel && (
            <button
              onClick={onCancel}
              style={{
                flex:         1,
                background:   "#eee",
                color:        "#444",
                border:       "none",
                borderRadius: "0 0 0 8px",
                padding:      "16px 0",
                fontWeight:   600,
                fontSize:     16,
                cursor:       "pointer",
                borderTop:    "1px solid #f0f0f0",
                borderRight:  "1px solid #f0f0f0"
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            style={{
              flex:         1,
              background:   confirmColor,
              color:        "#fff",
              border:       "none",
              borderRadius: showCancel ? "0 0 8px 0" : "0 0 8px 8px",
              padding:      "16px 0",
              fontWeight:   600,
              fontSize:     16,
              cursor:       "pointer",
              borderTop:    "1px solid #f0f0f0"
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;