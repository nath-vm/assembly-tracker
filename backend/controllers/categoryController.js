const mongoose = require("mongoose");
const Category = require("../models/Category");
const Assembly = require("../models/Assembly");

// ─── Get All Categories ───────────────────────────────────────────────────────
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Check Category In Use ────────────────────────────────────────────────────
const checkCategoryInUse = async (req, res) => {
  try {
    const { key } = req.params;
    const count   = await Assembly.countDocuments({ category: key });
    res.json({ inUse: count > 0, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Add Category ─────────────────────────────────────────────────────────────
const addCategory = async (req, res) => {
  try {
    const { key, label, order } = req.body;
    if (!key || !label) return res.status(400).json({ error: "Key and label are required" });

    // REMOVED: key validation - now allows spaces and any characters

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Key already exists" });

    const count    = await Category.countDocuments();
    const category = new Category({
      key,
      label,
      order: typeof order === "number" ? order : count
    });

    await category.save();
    const categories = await Category.find().sort({ order: 1 });
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Edit Category ────────────────────────────────────────────────────────────
const editCategory = async (req, res) => {
  try {
    const { key } = req.params;
    const { label, newKey, order, hidden } = req.body;

    const category = await Category.findOne({ key });
    if (!category) return res.status(404).json({ error: "Category not found" });

    const oldKey = category.key;

    if (newKey && newKey !== key) {
      // REMOVED: key validation - now allows spaces and any characters
      
      const exists = await Category.findOne({ key: newKey });
      if (exists) return res.status(400).json({ error: "New key already exists" });
      category.key = newKey;
    }

    if (label)                      category.label  = label;
    if (typeof order === "number")  category.order  = order;
    if (typeof hidden === "boolean") category.hidden = hidden;

    await category.save();

    // Cascade update to assemblies if key changed
    if (newKey && newKey !== oldKey) {
      await Assembly.updateMany(
        { category: oldKey },
        { $set: { category: newKey } }
      );
    }

    const all = await Category.find().sort({ order: 1 });
    await Promise.all(
      all.map((cat, i) =>
        Category.findByIdAndUpdate(cat._id, { order: i })
      )
    );

    const categories = await Category.find().sort({ order: 1 });
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Delete Category ──────────────────────────────────────────────────────────
const deleteCategory = async (req, res) => {
  try {
    const { key } = req.params;

    const category = await Category.findOne({ key });
    if (!category) return res.status(404).json({ error: "Category not found" });

    const inUse = await Assembly.findOne({ category: key });
    if (inUse) return res.status(400).json({ error: "Category is currently in use" });

    await category.deleteOne();
    const categories = await Category.find().sort({ order: 1 });
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Bulk Save Categories ─────────────────────────────────────────────────────
const bulkSaveCategories = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Categories array is required" });
    }

    const existing = await Category.find().session(session);
    const incomingKeys = new Set(categories.map((c) => c.key));

    // REMOVED: key validation loop - now allows spaces and any characters

    const removed = existing.filter((c) => !incomingKeys.has(c.key));

    for (const cat of removed) {
      const count = await Assembly.countDocuments({ category: cat.key }).session(session);
      if (count > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          error: `Cannot delete "${cat.label}" — it has ${count} ${count === 1 ? "assembly" : "assemblies"} assigned to it. Reassign or delete those assemblies first.`
        });
      }
    }

    await Category.deleteMany({}, { session });
    await Category.insertMany(
      categories.map((cat, i) => ({
        key:    cat.key,
        label:  cat.label,
        order:  typeof cat.order === "number" ? cat.order : i,
        hidden: !!cat.hidden
      })),
      { session }
    );

    await session.commitTransaction();
    
    const saved = await Category.find().sort({ order: 1 });
    res.json({ success: true, categories: saved });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

module.exports = {
  getCategories,
  checkCategoryInUse,
  addCategory,
  editCategory,
  deleteCategory,
  bulkSaveCategories
};