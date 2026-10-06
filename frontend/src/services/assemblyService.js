// src/services/assemblyService.js
import { apiFetch } from "./api";

const PATH = "/assemblies";

export async function getAssemblies(category = "all", showHidden = false) {
  const params = [];
  if (category && category !== "all") params.push(`category=${encodeURIComponent(category)}`);
  if (showHidden) params.push("showHidden=1");
  const url = params.length ? `${PATH}?${params.join("&")}` : PATH;
  return apiFetch(url);
}

export async function searchAssemblies(query, filter = "all", showHidden = false) {
  return apiFetch(
    `${PATH}/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}${showHidden ? "&showHidden=1" : ""}`
  );
}

export async function createAssembly(formData) {
  return apiFetch(PATH, { method: "POST", body: formData });
}

export async function updateAssembly(id, formData) {
  return apiFetch(`${PATH}/${id}`, { method: "PUT", body: formData });
}

export async function deleteAssembly(id) {
  return apiFetch(`${PATH}/${id}`, { method: "DELETE" });
}

export async function duplicateAssembly(id) {
  return apiFetch(`${PATH}/${id}/duplicate`, { method: "POST" });
}

export async function toggleAssemblyHidden(id, hidden) {
  return apiFetch(`${PATH}/${id}/toggle-hidden`, {
    method: "PUT",
    body: JSON.stringify({ hidden })
  });
}

export async function bulkToggleHidden(ids, hidden) {
  return apiFetch("/assemblies/bulk-toggle-hidden", {
    method: "PUT",
    body: JSON.stringify({ ids, hidden })
  });
}

export async function bulkDeleteAssemblies(ids) {
  return apiFetch("/assemblies/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

export async function bulkDuplicateAssemblies(ids) {
  return apiFetch("/assemblies/bulk-duplicate", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

export async function removeAssemblyImage(id) {
  return apiFetch(`${PATH}/${id}/remove-image`, { method: "PUT" });
}