const { sendServerError } = require("../utils/errors");
const Assembly   = require("../models/Assembly");
const AuditLog   = require("../models/AuditLog");
const cloudinary = require("../config/cloudinary");
const mongoose   = require("mongoose");

// ─── Helper: validate MongoDB ObjectId ───────────────────────────────────────
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ─── Helper: validate assembly fields ────────────────────────────────────────
function validateAssemblyBody({ category, title, items }) {
  if (!category || typeof category !== "string" || !category.trim()) {
    return "Category is required.";
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return "Title is required.";
  }
  if (title.trim().length > 200) {
    return "Title must be 200 characters or fewer.";
  }
  if (items !== undefined) {
    const parsed = typeof items === "string" ? (() => { try { return JSON.parse(items); } catch { return null; } })() : items;
    if (!Array.isArray(parsed)) return "Items must be an array.";
    for (const item of parsed) {
      if (!item.description || typeof item.description !== "string" || !item.description.trim()) {
        return "Each item must have a description.";
      }
      if (item.priceAtTime !== undefined && isNaN(Number(item.priceAtTime))) {
        return "Item price must be a number.";
      }
    }
  }
  return null;
}

// ─── Helper: log assembly audit event ────────────────────────────────────────
async function logAssembly(action, req, detail = {}) {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
               req.socket?.remoteAddress || "unknown";
    await AuditLog.create({ action, actor: "admin", ip, success: true, detail });
  } catch { /* non-fatal */ }
}

// ─── Helper: extract Cloudinary public_id from a URL ─────────────────────────
// Cloudinary URLs look like: https://res.cloudinary.com/<cloud>/image/upload/v123456/assembly_images/abc123.jpg
// The public_id is everything after /upload/vXXXXXX/ and before the file extension.
const extractPublicId = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z]+$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

// ─── Helper: delete image from Cloudinary if one exists ──────────────────────
const deleteCloudinaryImage = async (imageUrl) => {
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    // Non-fatal — don't block the main operation
  }
};

// ─── Get All Assemblies ───────────────────────────────────────────────────────
const getAssemblies = async (req, res) => {
  try {
    const { category, showHidden } = req.query;
    // Hidden assemblies are admin-only: the flag is ignored unless a valid token was sent.
    const includeHidden = Boolean(showHidden) && req.isAdmin === true;
    const query = category && typeof category === "string" && category !== "all" ? { category } : {};
    if (!includeHidden) query.hidden = { $ne: true };

    const assemblies = await Assembly.find(query).sort({ category: 1, title: 1 });
    res.json(assemblies);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Search Assemblies ────────────────────────────────────────────────────────
const searchAssemblies = async (req, res) => {
  try {
    const { q, filter, showHidden } = req.query;
    if (!q || typeof q !== "string") return res.status(400).json({ error: "Search query (q) is required" });
    if (q.length > 100) return res.status(400).json({ error: "Search query is too long" });
    const includeHidden = Boolean(showHidden) && req.isAdmin === true;

    // Escape special regex characters to prevent ReDoS attacks
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    let searchQuery = {};
    if (filter === "title") {
      searchQuery = { title: regex };
    } else if (filter === "code") {
      searchQuery = { items: { $elemMatch: { code: regex } } };
    } else if (filter === "description") {
      searchQuery = { items: { $elemMatch: { description: regex } } };
    } else {
      searchQuery = {
        $or: [
          { title: regex },
          { items: { $elemMatch: { code: regex } } },
          { items: { $elemMatch: { description: regex } } }
        ]
      };
    }

    if (!includeHidden) searchQuery.hidden = { $ne: true };

    const assemblies = await Assembly.find(searchQuery).sort({ category: 1, title: 1 });
    res.json(assemblies);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Create Assembly ──────────────────────────────────────────────────────────
const createAssembly = async (req, res) => {
  try {
    const { category, title, items } = req.body;

    const validationError = validateAssemblyBody({ category, title, items });
    if (validationError) return res.status(400).json({ error: validationError });

    const parsedItems = typeof items === "string" ? JSON.parse(items) : (items || []);
    const imageUrl = req.file ? req.file.path : "";

    const assembly = new Assembly({ category: category.trim(), title: title.trim(), items: parsedItems, image: imageUrl });
    await assembly.save();

    await logAssembly("ASSEMBLY_CREATED", req, { assemblyId: assembly._id, title: assembly.title });
    res.json(assembly);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Update Assembly ──────────────────────────────────────────────────────────
const updateAssembly = async (req, res) => {
  try {
    const existing = await Assembly.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Assembly not found" });

    const { category, title, items } = req.body;

    const validationError = validateAssemblyBody({ category, title, items });
    if (validationError) return res.status(400).json({ error: validationError });

    const parsedItems = typeof items === "string" ? JSON.parse(items) : (items || []);

    // If a new image was uploaded, delete the old one from Cloudinary
    if (req.file && existing.image) {
      await deleteCloudinaryImage(existing.image);
    }

    const imageUrl = req.file ? req.file.path : existing.image;

    const updated = await Assembly.findByIdAndUpdate(
      req.params.id,
      { category: category.trim(), title: title.trim(), items: parsedItems, image: imageUrl },
      { new: true, runValidators: true }
    );

    await logAssembly("ASSEMBLY_UPDATED", req, { assemblyId: updated._id, title: updated.title });
    res.json(updated);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Delete Assembly ──────────────────────────────────────────────────────────
const deleteAssembly = async (req, res) => {
  try {
    const deleted = await Assembly.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Assembly not found" });

    // Clean up image from Cloudinary
    if (deleted.image) {
      await deleteCloudinaryImage(deleted.image);
    }

    await logAssembly("ASSEMBLY_DELETED", req, { assemblyId: deleted._id, title: deleted.title });
    res.json({ message: "Assembly deleted successfully" });
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Duplicate Assembly ───────────────────────────────────────────────────────
const duplicateAssembly = async (req, res) => {
  try {
    const original = await Assembly.findById(req.params.id);
    if (!original) return res.status(404).json({ error: "Assembly not found" });

    const copy = new Assembly({
      category: original.category,
      title:    original.title + " (Copy)",
      items:    JSON.parse(JSON.stringify(original.items)),
      image:    "",     // don't copy image reference — original may be deleted later
      hidden:   false
    });

    await copy.save();
    await logAssembly("ASSEMBLY_DUPLICATED", req, { sourceId: original._id, newId: copy._id, title: copy.title });
    res.json(copy);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Toggle Hidden ────────────────────────────────────────────────────────────
const toggleHidden = async (req, res) => {
  try {
    const { hidden } = req.body;
    const updated = await Assembly.findByIdAndUpdate(
      req.params.id,
      { hidden: !!hidden },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Assembly not found" });
    res.json(updated);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Bulk Toggle Hidden ───────────────────────────────────────────────────────
const bulkToggleHidden = async (req, res) => {
  try {
    const { ids, hidden } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "ids array is required" });

    const invalidIds = ids.filter(id => !isValidObjectId(id));
    if (invalidIds.length > 0)
      return res.status(400).json({ error: "One or more ids are invalid." });

    await Assembly.updateMany({ _id: { $in: ids } }, { hidden: !!hidden });
    await logAssembly("ASSEMBLY_BULK_VISIBILITY", req, { ids, hidden: !!hidden, count: ids.length });
    res.json({ message: "Updated successfully", count: ids.length });
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Bulk Delete ──────────────────────────────────────────────────────────────
const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "ids array is required" });

    const invalidIds = ids.filter(id => !isValidObjectId(id));
    if (invalidIds.length > 0)
      return res.status(400).json({ error: "One or more ids are invalid." });

    // Fetch images before deleting so we can clean up Cloudinary
    const toDelete = await Assembly.find({ _id: { $in: ids } }).select("image title");
    const result   = await Assembly.deleteMany({ _id: { $in: ids } });

    // Clean up Cloudinary images (non-fatal if any fail)
    await Promise.allSettled(
      toDelete.filter(a => a.image).map(a => deleteCloudinaryImage(a.image))
    );

    await logAssembly("ASSEMBLY_BULK_DELETED", req, {
      count: result.deletedCount,
      titles: toDelete.map(a => a.title)
    });
    res.json({ message: "Deleted successfully", count: result.deletedCount });
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Bulk Duplicate ───────────────────────────────────────────────────────────
const bulkDuplicate = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "ids array is required" });

    const invalidIds = ids.filter(id => !isValidObjectId(id));
    if (invalidIds.length > 0)
      return res.status(400).json({ error: "One or more ids are invalid." });

    const originals = await Assembly.find({ _id: { $in: ids } });
    const copies = originals.map((original) => ({
      category: original.category,
      title:    original.title + " (Copy)",
      items:    JSON.parse(JSON.stringify(original.items)),
      image:    "",     // don't copy image reference — original may be deleted later
      hidden:   false
    }));

    await Assembly.insertMany(copies);
    res.json({ message: "Duplicated successfully", count: copies.length });
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

// ─── Remove Image ─────────────────────────────────────────────────────────────
const removeImage = async (req, res) => {
  try {
    const existing = await Assembly.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Assembly not found" });

    // Delete from Cloudinary before clearing the field
    if (existing.image) {
      await deleteCloudinaryImage(existing.image);
    }

    const updated = await Assembly.findByIdAndUpdate(
      req.params.id,
      { image: "" },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    return sendServerError(res, err, "assemblyController");
  }
};

module.exports = {
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
};