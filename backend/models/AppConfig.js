const mongoose = require("mongoose");

// Singleton config document — only one record ever exists (upserted by key "main")
const appConfigSchema = new mongoose.Schema({
  key:               { type: String, default: "main", unique: true },
  loginEnabled:      { type: Boolean, default: true },
  passwordHash:      { type: String, required: false },
  lastPasswordChange:{ type: Date,    default: null },
}, { timestamps: true });

module.exports = mongoose.model("AppConfig", appConfigSchema);