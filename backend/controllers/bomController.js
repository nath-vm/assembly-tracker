const { sendServerError } = require("../utils/errors");
const mongoose = require("mongoose");
const Assembly = require("../models/Assembly");

const MAX_ASSEMBLIES_PER_EXPORT = 200;

// ─── Export BOM ───────────────────────────────────────────────────────────────
const exportBom = async (req, res) => {
  try {
    const { assemblies } = req.body;
    if (!Array.isArray(assemblies) || assemblies.length === 0) {
      return res.status(400).json({ error: "No assemblies provided" });
    }

    if (assemblies.length > MAX_ASSEMBLIES_PER_EXPORT) {
      return res.status(400).json({ error: `Too many assemblies (max ${MAX_ASSEMBLIES_PER_EXPORT}).` });
    }
    const ids = assemblies.map((a) => a && a.id);
    if (ids.some((id) => typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: "One or more assembly ids are invalid." });
    }

    // Hidden assemblies are admin-only; public callers can't pull them in by id.
    const filter = { _id: { $in: ids } };
    if (req.isAdmin !== true) filter.hidden = { $ne: true };
    const assemblyDocs = await Assembly.find(filter);

    const quantityMap = Object.fromEntries(
      assemblies.map((a) => [a.id, a.quantity])
    );

    // Helper: merge duplicate items within a single assembly by description
    const dedupeItems = (items) => {
      const map = {};
      items.forEach((item) => {
        const desc = (item.description || "").trim();
        if (!map[desc]) {
          map[desc] = {
            description:   item.description || "(No Name)",
            quantity:      0,
            unitOfMeasure: item.unitOfMeasure || "",
            priceAtTime:   item.priceAtTime || 0
          };
        }
        map[desc].quantity += Number(item.quantity) || 0;
        // Keep the highest price if duplicates have different prices
        if ((item.priceAtTime || 0) > map[desc].priceAtTime) {
          map[desc].priceAtTime = item.priceAtTime || 0;
        }
      });
      return Object.values(map);
    };

    // FIX: Store the key directly inside each combined entry so we never rely on
    // index-based correlation between Object.keys() and Object.values(), which is
    // fragile and caused wrong priceConflict flags on exports.
    const combined = {};
    const priceConflicts = {};

    assemblyDocs.forEach((doc) => {
      const qty = Number(quantityMap[doc._id]) || 1;
      const dedupedItems = dedupeItems(doc.items);
      dedupedItems.forEach((item) => {
        const key = (item.description || "").trim().toLowerCase();
        const itemQty = (Number(item.quantity) || 0) * qty;
        const unitPrice = item.priceAtTime || 0;
        if (!combined[key]) {
          combined[key] = {
            _key:          key,           // store key inside the entry
            description:   item.description || "(No Name)",
            quantity:      0,
            unitOfMeasure: item.unitOfMeasure || "",
            unitPrice:     unitPrice,
          };
          priceConflicts[key] = { prices: [unitPrice] };
        } else {
          if (!priceConflicts[key].prices.includes(unitPrice)) {
            priceConflicts[key].prices.push(unitPrice);
          }
          // Keep the highest unit price seen across all assemblies
          if (unitPrice > combined[key].unitPrice) {
            combined[key].unitPrice = unitPrice;
          }
        }
        combined[key].quantity += itemQty;
      });
    });

    // Compute subtotal after all quantities and the final unitPrice are settled
    Object.values(combined).forEach((entry) => {
      entry.subtotal = entry.unitPrice * entry.quantity;
    });

    // Sort alphabetically, derive priceConflict from the entry's own stored _key
    const combinedArray = Object.values(combined)
      .map((item) => {
        const conflict = priceConflicts[item._key]?.prices?.length > 1;
        const { _key, ...rest } = item; // strip internal _key before sending
        return { ...rest, priceConflict: conflict };
      })
      .sort((a, b) => a.description.localeCompare(b.description, undefined, { sensitivity: "base" }));

    // Per-assembly details with deduplicated items
    const assemblyDetails = assemblyDocs.map((doc) => ({
      id:    doc._id,
      title: doc.title,
      image: doc.image,
      items: dedupeItems(doc.items)
    }));

    res.json({
      combined:   combinedArray,
      assemblies: assemblyDetails
    });
  } catch (err) {
    return sendServerError(res, err, "bomController");
  }
};

module.exports = { exportBom };
