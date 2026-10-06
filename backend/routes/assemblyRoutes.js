const express = require("express");
const router = express.Router();
const { requireAuth } = require("../auth");
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
router.get("/",        getAssemblies);
router.get("/search",  searchAssemblies);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post("/",                    requireAuth, upload.single("image"), createAssembly);
router.put("/bulk-toggle-hidden",   requireAuth, bulkToggleHidden);
router.post("/bulk-delete",         requireAuth, bulkDelete);
router.post("/bulk-duplicate",      requireAuth, bulkDuplicate);
router.put("/:id",                  requireAuth, upload.single("image"), updateAssembly);
router.delete("/:id",               requireAuth, deleteAssembly);
router.post("/:id/duplicate",       requireAuth, duplicateAssembly);
router.put("/:id/toggle-hidden",    requireAuth, toggleHidden);
router.put("/:id/remove-image",     requireAuth, removeImage);

module.exports = router;