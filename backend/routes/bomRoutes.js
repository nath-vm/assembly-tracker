const express = require("express");
const router = express.Router();
const { optionalAuth } = require("../auth");
const { exportBom } = require("../controllers/bomController");

// ─── Public Route — both admins and regular users can export BOM ────────────
router.post("/export", optionalAuth, exportBom);

module.exports = router;