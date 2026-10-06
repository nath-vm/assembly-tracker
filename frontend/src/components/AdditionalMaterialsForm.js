import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { getMaterials } from "../services/materialService";

const generateId = () => "_" + Math.random().toString(36).substr(2, 9);

const emptyItem = () => ({
  _id:           generateId(),
  quantity:      "",
  description:   "",
  unitOfMeasure: "",
  priceAtTime:   0,
  code:          ""
});

const fmtPrice = (v) =>
  v > 0
    ? `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    : "";

function AdditionalMaterialsForm({ initialData, onSave, onClose }) {
  const [items, setItems] = useState(() => {
    if (initialData && initialData.items) {
      return initialData.items.map((item) => ({ ...item, _id: item._id || generateId() }));
    }
    return [emptyItem()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Materials picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerMaterials, setPickerMaterials] = useState([]);
  const [matLoading, setMatLoading] = useState(false);
  const [matError, setMatError] = useState("");
  const [pickerQtyTarget, setPickerQtyTarget] = useState(null);
  const [pickerQtyValue, setPickerQtyValue] = useState("1");

  const fetchMaterials = async () => {
    setMatLoading(true);
    setMatError("");
    try {
      const data = await getMaterials();
      if (Array.isArray(data)) setPickerMaterials(data);
      else throw new Error("bad response");
    } catch {
      setMatError("Failed to load materials. Please try again.");
    } finally {
      setMatLoading(false);
    }
  };

  const handleOpenPicker = () => {
    setShowPicker(true);
    setPickerSearch("");
    setPickerQtyTarget(null);
    setPickerQtyValue("1");
    if (pickerMaterials.length === 0) fetchMaterials();
  };

  const filteredPickerMaterials = pickerMaterials.filter((m) =>
    !pickerSearch || m.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const handlePickerSelect = (mat) => {
    setPickerQtyTarget(mat);
    setPickerQtyValue("1");
  };

  const handlePickerConfirm = () => {
    if (!pickerQtyTarget) return;
    const qty = Math.max(1, parseInt(pickerQtyValue) || 1);
    const newRow = {
      _id:           generateId(),
      code:          pickerQtyTarget.code || "",
      quantity:      String(qty),
      description:   pickerQtyTarget.name,
      unitOfMeasure: pickerQtyTarget.unitOfMeasure || "",
      priceAtTime:   pickerQtyTarget.price || 0,
    };
    setItems((prev) => [...prev, newRow]);
    setPickerQtyTarget(null);
    setPickerQtyValue("1");
    setShowPicker(false);
  };

  const updateRow = (id, field, value) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row._id !== id) return row;
        const updated = { ...row, [field]: value };
        // Auto-fill UOM and price when a known material name is typed/selected
        if (field === "description") {
          const matched = pickerMaterials.find(
            (m) => m.name.toLowerCase() === value.toLowerCase()
          );
          if (matched) {
            updated.unitOfMeasure = matched.unitOfMeasure || updated.unitOfMeasure;
            updated.priceAtTime   = matched.price || 0;
            updated.code          = matched.code  || "";
          }
        }
        return updated;
      })
    );
  };

  const addRow = () => setItems((prev) => [...prev, emptyItem()]);

  const removeRow = (id) => {
    if (items.length === 1) {
      setItems([emptyItem()]);
      return;
    }
    setItems((prev) => prev.filter((r) => r._id !== id));
  };

  const handleSubmit = () => {
    const validItems = items.filter((r) => r.description.trim());
    if (validItems.length === 0) {
      setError("Please add at least one material.");
      return;
    }
    setError("");
    setSaving(true);
    // Normalize items
    const savedData = {
      id: "additional",
      title: "Additional Materials",
      items: validItems.map((item) => ({
        ...item,
        quantity: item.quantity || "1",
        priceAtTime: Number(item.priceAtTime) || 0,
      })),
    };
    onSave(savedData);
    toast.success("Additional materials saved.");
    setSaving(false);
    onClose();
  };

  // ESC to close
  // Load materials on mount so datalist autocomplete and autofill work
  // even before the picker modal is opened
  useEffect(() => { fetchMaterials(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (pickerQtyTarget) setPickerQtyTarget(null);
        else if (showPicker) setShowPicker(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pickerQtyTarget, showPicker, onClose]);

  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1150 }}>
        <div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: 800,
            width: "100%",
            padding: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
          }}
        >
          {/* Header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "#fff",
              borderBottom: "1px solid #e5e7eb",
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20 }}>Additional Materials</h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 24,
                cursor: "pointer",
                color: "#d32f2f",
              }}
            >
              &times;
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
            {error && (
              <div
                style={{
                  color: "#d00",
                  background: "#fff0f0",
                  padding: 10,
                  borderRadius: 4,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ fontWeight: "bold", marginBottom: 12 }}>Materials</div>

            {items.map((row, idx) => {
              const unitPrice = Number(row.priceAtTime) || 0;
              const qty = Number(row.quantity) || 0;
              const total = unitPrice * qty;

              return (
                <div
                  key={row._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 24, color: "#2596be", fontWeight: 500 }}>
                    {idx + 1}.
                  </div>
                  {/* Qty */}
                  <input
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(e) => updateRow(row._id, "quantity", e.target.value)}
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                    }}
                  />
                  {/* Material Name */}
                  <input
                    type="text"
                    placeholder="Material Name"
                    value={row.description}
                    onChange={(e) => updateRow(row._id, "description", e.target.value)}
                    style={{
                      flex: 2,
                      minWidth: 140,
                      padding: "6px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                    }}
                    list={`materials-list-${idx}`}
                  />
                  <datalist id={`materials-list-${idx}`}>
                    {pickerMaterials.map((mat) => (
                      <option key={mat._id} value={mat.name} />
                    ))}
                  </datalist>
                  {/* UOM */}
                  <input
                    type="text"
                    placeholder="UOM"
                    value={row.unitOfMeasure}
                    onChange={(e) => updateRow(row._id, "unitOfMeasure", e.target.value)}
                    style={{
                      width: 90,
                      padding: "6px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                    }}
                  />
                  {/* Unit Price */}
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit Price"
                    value={row.priceAtTime || ""}
                    onChange={(e) =>
                      updateRow(row._id, "priceAtTime", parseFloat(e.target.value) || 0)
                    }
                    style={{
                      width: 110,
                      padding: "6px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                    }}
                  />
                  {unitPrice > 0 && (
                    <span style={{ fontSize: 12, color: "#2596be", whiteSpace: "nowrap" }}>
                      {qty > 0 ? `= ${fmtPrice(total)}` : `${fmtPrice(unitPrice)}/unit`}
                    </span>
                  )}
                  <button
                    onClick={() => removeRow(row._id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#e11d48",
                      fontSize: 20,
                      cursor: "pointer",
                    }}
                  >
                    &times;
                  </button>
                </div>
              );
            })}

            {/* Sticky footer inside body? We'll put buttons at bottom of modal */}
          </div>

          {/* Footer buttons */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              background: "#fff",
              borderTop: "1px solid #e5e7eb",
              padding: "12px 20px",
              display: "flex",
              gap: 10,
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={addRow}
                style={{
                  background: "#f0f9ff",
                  color: "#2596be",
                  border: "1.5px solid #38caef",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add Material
              </button>
              <button
                onClick={handleOpenPicker}
                style={{
                  background: "#f0f9ff",
                  color: "#2596be",
                  border: "1.5px solid #38caef",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Browse Materials
              </button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  background: "#eee",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 20px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  background: "#2596be",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 20px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Save to Cart"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Materials Picker Modal (same as AssemblyForm) */}
      {showPicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.35)",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => {
            setShowPicker(false);
            setPickerQtyTarget(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 10,
              width: 420,
              maxWidth: "94vw",
              maxHeight: "72vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontWeight: 700 }}>Browse Materials</span>
              <button
                onClick={() => {
                  setShowPicker(false);
                  setPickerQtyTarget(null);
                }}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            {pickerQtyTarget ? (
              <div style={{ padding: "20px 18px" }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{pickerQtyTarget.name}</div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  {pickerQtyTarget.unitOfMeasure || "Unit/s"}
                  {pickerQtyTarget.price > 0 && (
                    <span style={{ color: "#2596be", marginLeft: 8 }}>
                      {fmtPrice(pickerQtyTarget.price)} / unit
                    </span>
                  )}
                </div>
                <label style={{ display: "block", marginBottom: 6 }}>Quantity</label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  value={pickerQtyValue}
                  onChange={(e) => setPickerQtyValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePickerConfirm()}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1.5px solid #38caef",
                    borderRadius: 6,
                    marginBottom: 16,
                  }}
                />
                {pickerQtyTarget.price > 0 && (
                  <div
                    style={{
                      background: "#f0f9ff",
                      padding: "8px 12px",
                      borderRadius: 6,
                      marginBottom: 16,
                    }}
                  >
                    {fmtPrice(pickerQtyTarget.price)} × {parseInt(pickerQtyValue) || 1} ={" "}
                    <strong>
                      {fmtPrice(pickerQtyTarget.price * (parseInt(pickerQtyValue) || 1))}
                    </strong>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => {
                      setPickerQtyTarget(null);
                      setPickerQtyValue("1");
                    }}
                    style={{
                      flex: 1,
                      padding: "10px",
                      background: "#f3f4f6",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePickerConfirm}
                    style={{
                      flex: 1,
                      padding: "10px",
                      background: "#2596be",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ padding: "10px 18px" }}>
                  <input
                    type="text"
                    placeholder="Search materials..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {matLoading ? (
                    <div style={{ textAlign: "center", padding: 32 }}>Loading materials...</div>
                  ) : matError ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#d00" }}>
                      {matError}
                      <button
                        onClick={fetchMaterials}
                        style={{
                          marginTop: 10,
                          padding: "6px 12px",
                          background: "#2596be",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : filteredPickerMaterials.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: "#888" }}>
                      No materials found.
                    </div>
                  ) : (
                    filteredPickerMaterials.map((mat, idx) => (
                      <div
                        key={mat._id}
                        onClick={() => handlePickerSelect(mat)}
                        style={{
                          padding: "10px 18px",
                          borderBottom: "1px solid #eee",
                          cursor: "pointer",
                          background: idx % 2 === 0 ? "#fff" : "#f7fbfd",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#e0f5fb")}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f7fbfd")
                        }
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{mat.name}</div>
                          <div style={{ fontSize: 12, color: "#888" }}>
                            {mat.unitOfMeasure || "Unit/s"}
                          </div>
                        </div>
                        {mat.price > 0 && (
                          <div style={{ color: "#2596be" }}>{fmtPrice(mat.price)}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AdditionalMaterialsForm;