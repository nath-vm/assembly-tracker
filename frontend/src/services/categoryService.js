import { apiFetch } from "./api";

const PATH = "/categories";

export async function getCategories() {
  return apiFetch(PATH);
}

export async function addCategory(category) {
  return apiFetch(PATH, {
    method: "POST",
    body: JSON.stringify(category)
  });
}

export async function editCategory(key, updates) {
  // FIX: encodeURIComponent so keys with spaces or special characters don't
  // produce a malformed URL (e.g. "roof assembly" → "roof%20assembly").
  return apiFetch(`${PATH}/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
}

export async function deleteCategory(key) {
  // FIX: same encoding fix as editCategory above.
  return apiFetch(`${PATH}/${encodeURIComponent(key)}`, { method: "DELETE" });
}

export async function bulkSaveCategories(categories) {
  return apiFetch(`${PATH}/bulk-save`, {
    method: "POST",
    body: JSON.stringify({ categories })
  });
}
