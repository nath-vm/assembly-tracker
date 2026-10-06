const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  unitOfMeasure: { type: String, required: true, trim: true, default: "Unit/s" },
  price:         { type: Number, default: 0 }
});

// Case-insensitive unique index
materialSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model("Material", materialSchema);