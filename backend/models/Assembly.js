const mongoose = require("mongoose");

// FIX: Removed { _id: false } from schema options.
// Previously, { _id: false } suppressed Mongoose's _id on sub-documents while
// simultaneously defining _id: { type: String } as an explicit field — the option
// won the conflict and the field was ignored, so frontend-generated IDs were never
// persisted. Removing the option lets the explicit String _id work as intended.
const materialItemSchema = new mongoose.Schema({
  _id:           { type: String },
  code:          { type: String, default: "", trim: true },
  quantity:      { type: String, default: "" },
  description:   { type: String, required: true, trim: true },
  unitOfMeasure: { type: String, default: "", trim: true },
  priceAtTime:   { type: Number, default: 0 }
});

const assemblySchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  title:    { type: String, required: true, trim: true },
  image:    { type: String, default: "" },
  hidden:   { type: Boolean, default: false },
  items:    [materialItemSchema]
}, { timestamps: true });

// Indexes for better query performance
assemblySchema.index({ category: 1, hidden: 1 });
assemblySchema.index({ title: 1 });
assemblySchema.index({ title: "text", "items.description": "text" });

module.exports = mongoose.model("Assembly", assemblySchema);
