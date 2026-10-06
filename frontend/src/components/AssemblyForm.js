import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import ConfirmDialog from "./ConfirmDialog";
import { getCategories } from "../services/categoryService";
import { getMaterials } from "../services/materialService";
import { removeAssemblyImage } from "../services/assemblyService";

const generateId = () => "_" + Math.random().toString(36).substr(2, 9);

const emptyItem = () => ({
  _id:           generateId(),
  quantity:      "",
  description:   "",
  unitOfMeasure: "",
  priceAtTime:   0,
  code:          ""      // kept for backend compatibility but hidden from UI
});

function AssemblyForm({ entry, onClose, onSave }) {
  const [categories,    setCategories]   = useState([]);
  const [imageFile,     setImageFile]    = useState(null);
  const [imagePreview,  setImagePreview] = useState(entry?.image || "");
  const [submitting,    setSubmitting]   = useState(false);
  const [error,         setError]        = useState("");
  const [isDirty,       setIsDirty]      = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, onConfirm: null });

  // ─── Materials picker state ───────────────────────────────────────────────
  const [showPicker,    setShowPicker]    = useState(false);
  const [pickerSearch,  setPickerSearch]  = useState("");
  const [pickerMaterials, setPickerMaterials] = useState([]);
  const [matLoading,    setMatLoading]    = useState(false);
  const [matError,      setMatError]      = useState("");
  const [pickerQtyTarget, setPickerQtyTarget] = useState(null);
  const [pickerQtyValue,  setPickerQtyValue]  = useState("1");

  const fileInputRef = useRef();

  // ─── Initialize form data ──────────────────────────────────────────────────
  const [formData, setFormData] = useState(() => {
    if (entry) {
      return {
        ...entry,
        items: entry.items.map((item) => ({
          ...item,
          _id: item._id || generateId(),
          priceAtTime: item.priceAtTime || 0,
          code: item.code || ""   // hidden
        }))
      };
    }
    return { category: "", title: "", image: "", items: [emptyItem()] };
  });

  // ─── Load categories and materials ────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [cats, mats] = await Promise.all([getCategories(), getMaterials()]);
        if (Array.isArray(cats)) {
          setCategories(cats.filter((c) => !c.hidden && c.key !== "all").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        }
        if (Array.isArray(mats)) setPickerMaterials(mats);
      } catch {
        // fail silently
      }
    }
    load();
  }, []);

  // ─── Dirty check ──────────────────────────────────────────────────────────
  useEffect(() => {
    const orig = entry || { category: "", title: "", items: [], image: "" };
    const dirty =
      formData.category !== orig.category ||
      formData.title    !== orig.title    ||
      imageFile         !== null          ||
      formData.items.length !== (orig.items?.length || 0) ||
      formData.items.some((item, i) =>
        item.quantity      !== (orig.items?.[i]?.quantity      || "") ||
        item.description   !== (orig.items?.[i]?.description   || "") ||
        item.unitOfMeasure !== (orig.items?.[i]?.unitOfMeasure || "") ||
        item.priceAtTime   !== (orig.items?.[i]?.priceAtTime   || 0)
      );
    setIsDirty(dirty);
  }, [formData, imageFile, entry]);

  // ─── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") handleCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleChange = (e, idx) => {
  const { name, value } = e.target;
    if (name === "category" || name === "title") {
      setFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }
    const items = [...formData.items];
    if (name === "description") {
      items[idx].description = value;           // ← always set the typed value first
      const matched = pickerMaterials.find((m) => m.name === value);
      if (matched) {
        items[idx].unitOfMeasure = matched.unitOfMeasure || "";
        items[idx].priceAtTime   = matched.price || 0;
        items[idx].code          = matched.code || "";
      }
    } else {
      items[idx][name] = value;
    }
    setFormData((prev) => ({ ...prev, items }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImagePaste = (e) => {
    const file = e.clipboardData?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setConfirmDialog({
      open:      true,
      type:      "delete",
      payload:   { label: "the attached image" },
      onConfirm: async () => {
        setImageFile(null);
        setImagePreview("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (entry?.image) await removeAssemblyImage(entry._id);
        setFormData((prev) => ({ ...prev, image: "" }));
        setConfirmDialog({ open: false });
      }
    });
  };

  // ─── Items ────────────────────────────────────────────────────────────────
  const MAX_ITEMS = 50;

  const addItem = () => {
    if (formData.items.length >= MAX_ITEMS) {
      toast.error(`Maximum of ${MAX_ITEMS} items per assembly.`);
      return;
    }
    setFormData((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (idx) => {
    if (formData.items.length === 1) return;
    const item    = formData.items[idx];
    const hasData = item.quantity || item.description || item.unitOfMeasure || item.priceAtTime;
    if (hasData) {
      setConfirmDialog({
        open:      true,
        type:      "delete",
        payload:   { label: "this material" },
        onConfirm: () => {
          setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
          setConfirmDialog({ open: false });
        }
      });
      return;
    }
    setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const moveItem = (idx, direction) => {
    const items    = [...formData.items];
    const newIndex = idx + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const [moved] = items.splice(idx, 1);
    items.splice(newIndex, 0, moved);
    setFormData((prev) => ({ ...prev, items }));
  };

  // ─── Material picker helpers ──────────────────────────────────────────────
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
    setFormData((prev) => ({ ...prev, items: [...prev.items, newRow] }));
    setPickerQtyTarget(null);
    setPickerQtyValue("1");
    setShowPicker(false);
  };

  // ─── Cancel ───────────────────────────────────────────────────────────────
  const handleCancel = () => {
    if (!isDirty) { onClose(); return; }
    setConfirmDialog({
      open:      true,
      type:      "cancel",
      onConfirm: () => { setConfirmDialog({ open: false }); onClose(); }
    });
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!formData.category) {
      setError("Please select a category.");
      return;
    }
    if (!formData.title.trim()) {
      setError("Please enter a title.");
      return;
    }

    const errors = formData.items.map((item) => ({
      description: !item.description ? "Required" : ""
    }));
    if (errors.some((e) => e.description)) {
      setError("Please fill in the material name for each item.");
      return;
    }

    setError("");
    setConfirmDialog({
      open:      true,
      type:      "save",
      onConfirm: () => { setConfirmDialog({ open: false }); actuallySave(); }
    });
  };

  const actuallySave = async () => {
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("category", formData.category);
      data.append("title",    formData.title);
      data.append("items", JSON.stringify(
        formData.items.map(({ _id, ...rest }) => ({
          ...rest,
          quantity: rest.quantity === "" ? undefined : rest.quantity,
          priceAtTime: Number(rest.priceAtTime) || 0
        }))
      ));
      if (imageFile) data.append("image", imageFile);
      await onSave(data);
      toast.success(entry ? "Assembly updated successfully." : "Assembly created successfully.");
    } catch (err) {
      setError("An error occurred while saving. Please try again.");
      toast.error("Failed to save assembly. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="modal-overlay" onClick={(e) => { if (e.target.classList.contains("modal-overlay")) handleCancel(); }}>
        <div className="modal" style={{ maxWidth: 900, width: "100%", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="modal-header" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 10, borderBottom: "1px solid #e5e7eb", padding: "14px 20px" }}>
            <h2 style={{ margin: 0 }}>{entry ? "Edit Assembly" : "New Assembly"}</h2>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
            {error && (
              <div style={{ color: "#d00", background: "#fff0f0", padding: 10, borderRadius: 4, marginBottom: 12, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Category */}
            <div className="form__group field">
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="form__field"
                required
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
              <label className="form__label">Category <span style={{ color: "#b00" }}>*</span></label>
            </div>

            {/* Title */}
            <div className="form__group field">
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="form__field"
                placeholder="Title"
                required
              />
              <label className="form__label">Title <span style={{ color: "#b00" }}>*</span></label>
            </div>

            {/* Image Upload */}
            <div
              onPaste={handleImagePaste}
              style={{
                background:   "#f7fbfd",
                border:       "2px dashed #38caef",
                borderRadius: 8,
                padding:      16,
                marginBottom: 16,
                maxWidth:     280
              }}
            >
              <div style={{ color: "#2596be", fontWeight: 500, marginBottom: 8 }}>
                Image <span style={{ color: "#888", fontWeight: 400 }}>(optional)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                ref={fileInputRef}
                style={{ marginBottom: 6 }}
              />
              <div style={{ fontSize: 13, color: "#2596be" }}>
                Or <span style={{ color: "#116399" }}>paste an image</span> anywhere in this box
              </div>
              {imagePreview && (
                <div style={{ position: "relative", display: "inline-block", marginTop: 8 }}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, border: "1px solid #38caef" }}
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    style={{
                      position:     "absolute",
                      top:          0,
                      right:        0,
                      background:   "#fff",
                      border:       "none",
                      color:        "#d00",
                      fontWeight:   "bold",
                      fontSize:     18,
                      cursor:       "pointer",
                      borderRadius: "50%",
                      width:        28,
                      height:       28
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Materials Table */}
            <div style={{ fontWeight: "bold", fontSize: "1.1em", margin: "16px 0 8px 0", letterSpacing: 1 }}>
              Materials
            </div>

            {formData.items.map((item, idx) => {
              const unitPrice = Number(item.priceAtTime) || 0;
              const qty       = Number(item.quantity)    || 0;
              const total     = unitPrice * qty;

              return (
                <div key={item._id} style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                  {/* Row number */}
                  <div style={{ minWidth: 20, color: "#2596be", fontSize: 13, fontWeight: 500 }}>
                    {idx + 1}.
                  </div>

                  {/* Qty */}
                  <div className="form__group field" style={{ flex: "1 1 70px", minWidth: 70 }}>
                    <input
                      type="number"
                      name="quantity"
                      value={item.quantity}
                      onChange={(e) => handleChange(e, idx)}
                      className="form__field"
                      placeholder="Qty"
                      id={`qty-${idx}`}
                    />
                    <label className="form__label">Qty</label>
                  </div>

                  {/* Material Name */}
                  <div className="form__group field" style={{ flex: "2 1 180px", minWidth: 140 }}>
                    <input
                      type="text"
                      name="description"
                      value={item.description}
                      onChange={(e) => handleChange(e, idx)}
                      className="form__field"
                      placeholder="Material Name"
                      list={`materials-${idx}`}
                      id={`desc-${idx}`}
                    />
                    <datalist id={`materials-${idx}`}>
                      {pickerMaterials.map((mat) => (
                        <option key={mat._id} value={mat.name} />
                      ))}
                    </datalist>
                    <label className="form__label">Material Name <span style={{ color: "#b00" }}>*</span></label>
                  </div>

                  {/* UOM */}
                  <div className="form__group field" style={{ flex: "1 1 100px", minWidth: 90 }}>
                    <input
                      type="text"
                      name="unitOfMeasure"
                      value={item.unitOfMeasure}
                      onChange={(e) => handleChange(e, idx)}
                      className="form__field"
                      placeholder="UOM"
                      id={`uom-${idx}`}
                    />
                    <label className="form__label">UOM</label>
                  </div>

                  {/* Price (unit price, displays live total) */}
                  <div className="form__group field" style={{ flex: "1 1 120px", minWidth: 100 }}>
                    <input
                      type="number"
                      step="0.01"
                      name="priceAtTime"
                      value={item.priceAtTime || ""}
                      onChange={(e) => handleChange(e, idx)}
                      className="form__field"
                      placeholder="Unit Price"
                      id={`price-${idx}`}
                    />
                    <label className="form__label">Unit Price</label>
                    {unitPrice > 0 && (
                      <div style={{ fontSize: 11, color: "#2596be", marginTop: 2 }}>
                        {qty > 0 ? `${unitPrice} × ${qty} = ${total.toFixed(2)}` : `${unitPrice} / unit`}
                      </div>
                    )}
                  </div>

                  {/* Move + Remove */}
                  <div style={{ display: "flex", gap: 2 }}>
                    <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={arrowBtn(idx === 0)}>↑</button>
                    <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === formData.items.length - 1} style={arrowBtn(idx === formData.items.length - 1)}>↓</button>
                    {formData.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} style={{ ...arrowBtn(false), color: "#b00", fontSize: 20 }}>×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Footer with Add Material and Browse Materials */}
          <div style={{
            position: "sticky",
            bottom: 0,
            background: "#fff",
            borderTop: "1px solid #e5e7eb",
            padding: "12px 20px",
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={addItem}
                style={{ background: "#f0f9ff", color: "#2596be", border: "1.5px solid #38caef", borderRadius: 6, padding: "9px 16px", fontWeight: 600 }}
              >
                Add Material
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleOpenPicker}
                style={{ background: "#f0f9ff", color: "#2596be", border: "1.5px solid #38caef", borderRadius: 6, padding: "9px 16px", fontWeight: 600 }}
              >
                Browse Materials
              </button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                style={{
                  background: "#eee", color: "#444", border: "none", borderRadius: 6,
                  padding: "9px 20px", fontWeight: 600, cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  background: "#2596be", color: "#fff", border: "none", borderRadius: 6,
                  padding: "9px 20px", fontWeight: 600, cursor: "pointer"
                }}
              >
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Materials Picker Modal */}
      {showPicker && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.35)", zIndex: 1300,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
          onClick={() => { setShowPicker(false); setPickerQtyTarget(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 10, width: 420, maxWidth: "94vw",
              maxHeight: "72vh", display: "flex", flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden"
            }}
          >
            {/* Picker header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Browse Materials</span>
              <button onClick={() => { setShowPicker(false); setPickerQtyTarget(null); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            {pickerQtyTarget ? (
              // Quantity prompt
              <div style={{ padding: "20px 18px" }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{pickerQtyTarget.name}</div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  {pickerQtyTarget.unitOfMeasure || "Unit/s"}
                  {pickerQtyTarget.price > 0 && <span style={{ color: "#2596be", marginLeft: 8 }}>₱{pickerQtyTarget.price} / unit</span>}
                </div>
                <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>Quantity</label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  value={pickerQtyValue}
                  onChange={(e) => setPickerQtyValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePickerConfirm()}
                  style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #38caef", borderRadius: 6, marginBottom: 16 }}
                />
                {pickerQtyTarget.price > 0 && (
                  <div style={{ background: "#f0f9ff", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
                    ₱{pickerQtyTarget.price} × {parseInt(pickerQtyValue) || 1} = ₱{(pickerQtyTarget.price * (parseInt(pickerQtyValue) || 1)).toFixed(2)}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setPickerQtyTarget(null); setPickerQtyValue("1"); }} style={{ flex: 1, padding: "10px", background: "#f3f4f6", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>Back</button>
                  <button onClick={handlePickerConfirm} style={{ flex: 1, padding: "10px", background: "#2596be", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>Add</button>
                </div>
              </div>
            ) : (
              // Material list
              <>
                <div style={{ padding: "10px 18px" }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search materials..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {matLoading ? (
                    <div style={{ textAlign: "center", padding: 32 }}>Loading materials...</div>
                  ) : matError ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#d00" }}>
                      {matError}<br />
                      <button onClick={fetchMaterials} style={{ marginTop: 10, padding: "6px 12px", background: "#2596be", color: "#fff", border: "none", borderRadius: 4 }}>Retry</button>
                    </div>
                  ) : filteredPickerMaterials.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32, color: "#888" }}>No materials found.</div>
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
                          display: "flex", justifyContent: "space-between"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#e0f5fb"}
                        onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f7fbfd"}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{mat.name}</div>
                          <div style={{ fontSize: 12, color: "#888" }}>{mat.unitOfMeasure || "Unit/s"}</div>
                        </div>
                        {mat.price > 0 && <div style={{ color: "#2596be" }}>₱{mat.price.toFixed(2)}</div>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        type={confirmDialog.type}
        payload={confirmDialog.payload}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false })}
      />
    </>
  );
}

const arrowBtn = (disabled) => ({
  background:     "none",
  border:         "none",
  cursor:         disabled ? "not-allowed" : "pointer",
  opacity:        disabled ? 0.4 : 1,
  fontSize:       18,
  padding:        0,
  color:          "#888",
  lineHeight:     1,
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
});

export default AssemblyForm;