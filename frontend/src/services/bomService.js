import { apiFetch } from "./api";

const PATH = "/bom";

export async function exportBom(assemblies) {
  const result = await apiFetch(`${PATH}/export`, {
    method: "POST",
    body: JSON.stringify({ assemblies })
  });

  if (result?.error) throw new Error(result.error);
  return result;
}