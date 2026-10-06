// src/services/api.js
// Centralized fetch wrapper — automatically handles 401 session expiry
// and network errors (e.g. Render cold starts).
//
// Usage:
//   import { apiFetch } from "./api";
//   const res = await apiFetch("/assemblies", { method: "GET" });
//
// To skip the session-expired redirect (e.g. on the login route itself, which
// legitimately returns 401 for wrong password), pass skipSessionCheck: true:
//   const res = await apiFetch("/auth/login", { method: "POST", skipSessionCheck: true, ... });

const BASE_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

export { BASE_URL };

export async function apiFetch(path, options = {}) {
  const { skipSessionCheck = false, ...fetchOptions } = options;

  const token = sessionStorage.getItem("token");

  // Merge auth header in — don't override caller-supplied headers
  const headers = {
    ...(fetchOptions.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  // Only set Content-Type JSON if body is not FormData
  if (!(fetchOptions.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });
  } catch {
    // Network failure (server down, cold start, no connection)
    return { error: "network-error", message: "Could not reach the server. Please try again." };
  }

  // FIX: Only fire the session-expired event when skipSessionCheck is false.
  // The login route legitimately returns 401 (wrong password) and 403 (login
  // disabled) — without this flag those responses were silently swallowed and
  // the user never saw an error message on the login page.
  if (!skipSessionCheck && (res.status === 401 || res.status === 403)) {
    window.dispatchEvent(new CustomEvent("session-expired"));
    return { error: "session-expired" };
  }

  try {
    return await res.json();
  } catch {
    return { error: "invalid-response", message: "Server returned an unexpected response." };
  }
}
