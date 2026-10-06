const express = require("express");
const router = express.Router();
const { exportBom } = require("../controllers/bomController");

// ─── Public Route — both admins and regular users can export BOM ────────────
router.post("/export", exportBom);

module.exports = router;