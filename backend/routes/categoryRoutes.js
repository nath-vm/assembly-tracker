const express = require("express");
const router  = express.Router();
const { requireAuth } = require("../auth");
const {
  getCategories,
  checkCategoryInUse,
  addCategory,
  editCategory,
  deleteCategory,
  bulkSaveCategories
} = require("../controllers/categoryController");

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get("/",             getCategories);
router.get("/:key/in-use", checkCategoryInUse);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post("/",          requireAuth, addCategory);
router.post("/bulk-save", requireAuth, bulkSaveCategories);
router.put("/:key",       requireAuth, editCategory);
router.delete("/:key",    requireAuth, deleteCategory);

module.exports = router;