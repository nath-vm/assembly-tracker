/**
 * Sanitize a string for safe use as a filename across all operating systems.
 *
 * Removes/replaces characters that are illegal on Windows (\ / : * ? " < > |),
 * strips leading/trailing dots and spaces (Windows quirk), and collapses
 * internal whitespace to underscores. Truncates to maxLength to avoid
 * PATH_MAX issues.
 *
 * @param {string} name     Raw name (e.g. assembly title)
 * @param {number} maxLength  Max character length (default 100)
 * @returns {string}  Safe filename segment (no extension)
 */
export function sanitizeFilename(name, maxLength = 100) {
  if (!name || typeof name !== "string") return "untitled";

  return name
    .replace(/[\\/:*?"<>|]/g, "")   // strip Windows-illegal chars
    .replace(/\s+/g, "_")            // spaces → underscores
    .replace(/\.+$/, "")             // trailing dots (Windows quirk)
    .replace(/^\.+/, "")             // leading dots (hidden file quirk)
    .slice(0, maxLength)             // cap length
    || "untitled";                   // fallback if everything was stripped
}

/**
 * Build a dated export filename.
 * e.g. sanitizeExportName("A/B Test", "xlsx") → "AB_Test_2026-05-19.xlsx"
 */
export function exportFilename(title, ext) {
  const date = new Date().toISOString().slice(0, 10);
  return `${sanitizeFilename(title)}_${date}.${ext}`;
}
