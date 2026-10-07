const express = require("express");
const router = express.Router();
const { requireAuth } = require("../auth");
const validateObjectId = require("../middleware/validateObjectId");
const {
  getMaterials,
  addMaterial,
  editMaterial,
  deleteMaterial,
  checkMaterialDuplicates,
  bulkImportMaterials,
  syncAllMaterials,
} = require("../controllers/materialController");

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get("/", getMaterials);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post("/",               requireAuth, addMaterial);
router.post("/sync-all",       requireAuth, syncAllMaterials);
router.post("/check-duplicates", requireAuth, checkMaterialDuplicates);
router.post("/bulk-import",    requireAuth, bulkImportMaterials);
router.put("/:id",             requireAuth, validateObjectId(), editMaterial);
router.delete("/:id",          requireAuth, validateObjectId(), deleteMaterial);

module.exports = router;