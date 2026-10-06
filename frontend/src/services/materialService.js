import { apiFetch } from "./api";

const PATH = "/materials";

export async function getMaterials() {
  return apiFetch(PATH);
}

export async function addMaterial(name, unitOfMeasure, price) {
  return apiFetch(PATH, {
    method: "POST",
    body: JSON.stringify({ name, unitOfMeasure, price })
  });
}

export async function editMaterial(id, name, unitOfMeasure, price) {
  return apiFetch(`${PATH}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, unitOfMeasure, price })
  });
}

export async function deleteMaterial(id) {
  return apiFetch(`${PATH}/${id}`, { method: "DELETE" });
}

// New bulk import functions
export async function checkMaterialDuplicates(names) {
  return apiFetch(`${PATH}/check-duplicates`, {
    method: "POST",
    body: JSON.stringify({ names })
  });
}

export async function bulkImportMaterials(materials) {
  return apiFetch(`${PATH}/bulk-import`, {
    method: "POST",
    body: JSON.stringify({ materials })
  });
}

export async function syncAllMaterials() {
  return apiFetch(`${PATH}/sync-all`, {
    method: "POST"
  });
}