import axios from "axios";

// Minimal axios client for the marketing app.
// No retry/refresh interceptor and no idempotency keys — this app only does
// public GETs and the login POST. Login is the first request on a fresh
// session, so the backend CSRF middleware lets it through (it only enforces
// X-CSRF-Token when an auth cookie is already present).

export const api = axios.create({
  baseURL: "/api/v1", // rewritten by next.config.js to the ERP origin
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

// Attach the CSRF token to mutating requests when one is present.
api.interceptors.request.use((config) => {
  const csrf = getCookie("csrf_token");
  if (csrf && ["post", "patch", "put", "delete"].includes(config.method?.toLowerCase() || "")) {
    config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});
