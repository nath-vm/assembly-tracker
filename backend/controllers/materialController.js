const { sendServerError } = require("../utils/errors");
const Material = require("../models/Material");
const Assembly = require("../models/Assembly");

// ─── Helper: escape regex special characters ─────────────────────────────────
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// ─── Helper: check if material is used in any assembly ───────────────────────
const checkMaterialInUse = async (materialName) => {
  const escapedName = escapeRegex(materialName.trim());
  const nameRegex = new RegExp(`^${escapedName}$`, "i");
  return await Assembly.countDocuments({ "items.description": nameRegex });
};

// ─── Helper: propagate a material update to all assemblies ───────────────────
const propagateToAssemblies = async (oldName, newName, newUOM, newPrice) => {
  let totalModified = 0;

  try {
    const escapedOldName = escapeRegex(oldName.trim());
    const nameRegex = new RegExp(`^${escapedOldName}$`, "i");

    const r = await Assembly.updateMany(
      { "items.description": nameRegex },
      {
        $set: {
          "items.$[elem].description":   newName,
          "items.$[elem].unitOfMeasure": newUOM,
          "items.$[elem].priceAtTime":   newPrice
        }
      },
      { arrayFilters: [{ "elem.description": nameRegex }] }
    );
    totalModified += r.modifiedCount || 0;
  } catch (err) {
    console.error("propagateToAssemblies error:", err.message);
  }

  return totalModified;
};

// ─── Get All Materials ────────────────────────────────────────────────────────
const getMaterials = async (req, res) => {
  try {
    const materials = await Material.find({
      name: { $exists: true, $ne: "" }
    }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 });
    res.json(materials);
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Add Material ─────────────────────────────────────────────────────────────
const addMaterial = async (req, res) => {
  try {
    const { name, unitOfMeasure, price } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Case-insensitive check
    const exists = await Material.findOne({ 
      name: { $regex: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') }
    });
    if (exists) return res.status(409).json({ error: "Material already exists" });

    const material = new Material({
      name:          name.trim(),
      unitOfMeasure: unitOfMeasure && unitOfMeasure.trim() ? unitOfMeasure.trim() : "Unit/s",
      price:         price !== undefined && price !== "" ? Number(price) : 0
    });

    await material.save();
    res.json(material);
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Edit Material ────────────────────────────────────────────────────────────
const editMaterial = async (req, res) => {
  try {
    const { name, unitOfMeasure, price } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const existing = await Material.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Material not found" });

    const oldName = existing.name;

    // Check for duplicate name (case-insensitive)
    if (oldName.toLowerCase() !== name.trim().toLowerCase()) {
      const duplicate = await Material.findOne({ 
        name: { $regex: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') }
      });
      if (duplicate) {
        return res.status(409).json({ error: "A material with this name already exists" });
      }
    }

    const update = {
      name:  name.trim(),
      price: price !== undefined && price !== "" ? Number(price) : existing.price
    };
    if (unitOfMeasure && unitOfMeasure.trim()) {
      update.unitOfMeasure = unitOfMeasure.trim();
    }

    const material = await Material.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    const assembliesUpdated = await propagateToAssemblies(
      oldName,
      material.name,
      material.unitOfMeasure,
      material.price
    );

    res.json({ ...material.toObject(), assembliesUpdated });
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Delete Material (with in-use check) ──────────────────────────────────────
const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ error: "Material not found" });

    // Check if material is used in any assembly
    const inUseCount = await checkMaterialInUse(material.name);
    if (inUseCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete "${material.name}" — it is used in ${inUseCount} assembly/assemblies.`,
        inUseCount
      });
    }

    await material.deleteOne();
    res.json({ message: "Material deleted successfully" });
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Check Duplicates (for bulk import) ──────────────────────────────────────
const checkMaterialDuplicates = async (req, res) => {
  try {
    const { names } = req.body;
    if (!Array.isArray(names)) {
      return res.status(400).json({ error: "names array required" });
    }
    // Case-insensitive search for duplicates
    const matches = await Material.find({ 
      name: { $in: names.map(n => new RegExp('^' + escapeRegex(n) + '$', 'i')) }
    }).select("name unitOfMeasure price");
    res.json({ matches });
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Bulk Import Materials ────────────────────────────────────────────────────
const bulkImportMaterials = async (req, res) => {
  try {
    const { materials } = req.body;
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: "materials array required" });
    }

    let imported          = 0;
    let overwritten       = 0;
    let skipped           = 0;
    let failed            = 0;
    let assembliesUpdated = 0;

    for (const mat of materials) {
      try {
        const { name, unitOfMeasure, price, action } = mat;
        if (!name || !name.trim()) { failed++; continue; }

        // Case-insensitive lookup
        const existing = await Material.findOne({ 
          name: { $regex: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') }
        });

        if (existing) {
          if (action === "overwrite") {
            const oldName  = existing.name;
            const newUOM   = (unitOfMeasure && unitOfMeasure.trim()) ? unitOfMeasure.trim() : existing.unitOfMeasure;
            const newPrice = (price !== undefined && price !== "") ? Number(price) : existing.price;

            existing.unitOfMeasure = newUOM;
            existing.price         = newPrice;
            await existing.save();
            overwritten++;

            const count = await propagateToAssemblies(
              oldName,
              existing.name,
              newUOM,
              newPrice
            );
            assembliesUpdated += count;
          } else {
            skipped++;
          }
        } else {
          const newMat = new Material({
            name:          name.trim(),
            unitOfMeasure: (unitOfMeasure && unitOfMeasure.trim()) ? unitOfMeasure.trim() : "Unit/s",
            price:         (price !== undefined && price !== "") ? Number(price) : 0
          });
          await newMat.save();
          imported++;
        }
      } catch (err) {
        failed++;
      }
    }

    res.json({ imported, overwritten, skipped, failed, assembliesUpdated });
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

// ─── Sync All Materials → Assemblies (sequential for consistency) ─────────────
const syncAllMaterials = async (req, res) => {
  try {
    const materials = await Material.find({ name: { $exists: true, $ne: "" } });
    let totalAssembliesUpdated = 0;
    let materialsMatched       = 0;

    // Process sequentially to avoid race conditions
    for (const mat of materials) {
      const modifiedCount = await propagateToAssemblies(mat.name, mat.name, mat.unitOfMeasure, mat.price);
      if (modifiedCount > 0) {
        materialsMatched++;
        totalAssembliesUpdated += modifiedCount;
      }
    }

    res.json({
      message:               "Sync complete",
      totalMaterials:        materials.length,
      materialsMatched,
      totalAssembliesUpdated
    });
  } catch (err) {
    return sendServerError(res, err, "materialController");
  }
};

module.exports = {
  getMaterials,
  addMaterial,
  editMaterial,
  deleteMaterial,
  checkMaterialDuplicates,
  bulkImportMaterials,
  syncAllMaterials,
};