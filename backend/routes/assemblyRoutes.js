const express = require("express");
const router = express.Router();
const { requireAuth, optionalAuth } = require("../auth");
const validateObjectId = require("../middleware/validateObjectId");
const upload = require("../config/multer");
const {
  getAssemblies,
  searchAssemblies,
  createAssembly,
  updateAssembly,
  deleteAssembly,
  duplicateAssembly,
  toggleHidden,
  bulkToggleHidden,
  bulkDelete,
  bulkDuplicate,
  removeImage
} = require("../controllers/assemblyController");

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get("/",        optionalAuth, getAssemblies);
router.get("/search",  optionalAuth, searchAssemblies);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post("/",                    requireAuth, upload.single("image"), createAssembly);
router.put("/bulk-toggle-hidden",   requireAuth, bulkToggleHidden);
router.post("/bulk-delete",         requireAuth, bulkDelete);
router.post("/bulk-duplicate",      requireAuth, bulkDuplicate);
router.put("/:id",                  requireAuth, validateObjectId(), upload.single("image"), updateAssembly);
router.delete("/:id",               requireAuth, validateObjectId(), deleteAssembly);
router.post("/:id/duplicate",       requireAuth, validateObjectId(), duplicateAssembly);
router.put("/:id/toggle-hidden",    requireAuth, validateObjectId(), toggleHidden);
router.put("/:id/remove-image",     requireAuth, validateObjectId(), removeImage);

module.exports = router;