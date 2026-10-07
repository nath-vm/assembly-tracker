const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  action:    { type: String, required: true },   // e.g. "LOGIN_SUCCESS"
  actor:     { type: String, default: "admin" }, // who did it
  ip:        { type: String, default: null },
  success:   { type: Boolean, default: true },
  detail:    { type: Object, default: {} },       // optional extra info
  timestamp: { type: Date, default: Date.now },
});

// Auto-delete entries after 90 days so unauthenticated login attempts can't grow the collection forever.
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("AuditLog", auditLogSchema);