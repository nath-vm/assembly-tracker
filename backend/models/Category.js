const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  key:    { type: String, required: true, unique: true, trim: true },
  label:  { type: String, required: true, trim: true },
  order:  { type: Number, required: true },
  hidden: { type: Boolean, default: false }
});

module.exports = mongoose.model("Category", categorySchema);