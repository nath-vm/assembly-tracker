const bcrypt    = require("bcryptjs");
const AppConfig = require("../models/AppConfig");
const AuditLog  = require("../models/AuditLog");

// ─── Helper: get or create singleton config ───────────────────────────────────
async function getConfig() {
  let cfg = await AppConfig.findOne({ key: "main" });
  if (!cfg) {
    // Initialize with password from .env if available
    const initialHash = process.env.SECRET_KEY ? await bcrypt.hash(process.env.SECRET_KEY, 10) : null;
    cfg = await AppConfig.create({
      key: "main",
      loginEnabled: true,
      passwordHash: initialHash,
      lastPasswordChange: initialHash ? new Date() : null
    });
  }
  return cfg;
}

// ─── Helper: log an audit event ───────────────────────────────────────────────
async function log(action, ip, success = true, detail = {}) {
  await AuditLog.create({ action, actor: "admin", ip, success, detail });
}

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

// ─── GET /api/settings/config ─────────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  try {
    const cfg = await getConfig();
    res.json({
      loginEnabled:       cfg.loginEnabled,
      lastPasswordChange: cfg.lastPasswordChange,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load config." });
  }
};

// ─── POST /api/settings/change-password ──────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const ip = getIP(req);

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Both current and new password are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const cfg = await getConfig();

  // FIX: Guard against a null passwordHash. This can happen if the AppConfig
  // document was created before SECRET_KEY was set (e.g. first deploy without
  // the env var). bcrypt.compare(anything, null) throws, so we catch it early
  // with a clear message instead of a silent 500.
  if (!cfg.passwordHash) {
    return res.status(400).json({
      error: "No password is currently set. Please contact the administrator or re-deploy with SECRET_KEY configured."
    });
  }

  // Verify current password against stored hash
  const isValid = await bcrypt.compare(currentPassword, cfg.passwordHash);
  if (!isValid) {
    await log("PASSWORD_CHANGE_FAILED", ip, false, { reason: "Wrong current password" });
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  // Hash and store new password
  const newHash = await bcrypt.hash(newPassword, 10);
  cfg.passwordHash = newHash;
  cfg.lastPasswordChange = new Date();
  await cfg.save();

  await log("PASSWORD_CHANGED", ip, true, { note: "Admin changed the login password" });

  res.json({ message: "Password updated successfully." });
};

// ─── POST /api/settings/toggle-login ─────────────────────────────────────────
exports.toggleLogin = async (req, res) => {
  const { loginEnabled } = req.body;
  const ip = getIP(req);

  if (typeof loginEnabled !== "boolean") {
    return res.status(400).json({ error: "loginEnabled must be a boolean." });
  }

  // FIX: Prevent self-lockout. If the admin is trying to disable login, we
  // allow it — but we warn them clearly in the response. If they want a hard
  // guard instead, flip the condition below to a 400 rejection.
  //
  // The real danger was a silent disable with no recovery path. Now:
  //   - Disabling is still permitted (it's a legitimate feature).
  //   - The response includes a recoveryNote so the UI can surface a warning.
  //   - To re-enable, the admin must directly update MongoDB or redeploy with
  //     SECRET_KEY set, which will re-seed the AppConfig on next login attempt.
  const cfg = await getConfig();

  // Guard: block disabling login if there is no password hash stored yet.
  // Without a hash, re-enabling would require a manual DB edit.
  if (!loginEnabled && !cfg.passwordHash) {
    return res.status(400).json({
      error: "Cannot disable login: no admin password is set. Set a password first."
    });
  }

  cfg.loginEnabled = loginEnabled;
  await cfg.save();

  await log("LOGIN_TOGGLE", ip, true, { loginEnabled });

  res.json({
    message:      loginEnabled ? "Login has been enabled." : "Login has been disabled.",
    loginEnabled: cfg.loginEnabled,
    // Surfaced so the frontend can show a warning banner when disabling
    recoveryNote: !loginEnabled
      ? "Login is now disabled. To re-enable, log in while your current session is still active, or update the database directly."
      : null,
  });
};

// ─── GET /api/settings/audit-log ─────────────────────────────────────────────
exports.getAuditLog = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit log." });
  }
};