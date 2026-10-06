const express    = require("express");
const router     = express.Router();
const ctrl       = require("../controllers/settingsController");
const { requireAuth } = require("../auth");

// All settings routes require a valid JWT
router.get ("/config",          requireAuth, ctrl.getConfig);
router.post("/change-password", requireAuth, ctrl.changePassword);
router.post("/toggle-login",    requireAuth, ctrl.toggleLogin);
router.get ("/audit-log",       requireAuth, ctrl.getAuditLog);

module.exports = router;