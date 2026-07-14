import * as Sentry from "@sentry/nextjs";
import axios from "axios";

// Setup base API URL. If client-side, relative path works perfectly due to Caddy reverse proxy.
const API_BASE_URL = typeof window !== "undefined"
  ? "/api/v1"
  : (process.env.NEXT_PUBLIC_API_URL || "http://backend:8000/api/v1");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial for forwarding HttpOnly cookies
  headers: {
    "Content-Type": "application/json",
  },
});

let isRedirectingToLogin = false;
let redirectTimer: ReturnType<typeof setTimeout> | null = null;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

// Request interceptor to attach CSRF token to mutating requests
apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token')
  if (csrfToken && ['post', 'patch', 'put', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

// Request interceptor to attach idempotency keys to mutating requests
apiClient.interceptors.request.use((config) => {
  if (['post', 'patch', 'put'].includes(config.method?.toLowerCase() || '')) {
    const key = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36)}`
    config.headers['Idempotency-Key'] = key
  }
  return config
})

function resetRedirectFlag() {
  isRedirectingToLogin = false;
  redirectTimer = null;
}

// Response interceptor to handle global auth failures (e.g. 401 redirects)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const maxRetries = 2;

    if (!error.response) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      if (originalRequest._retryCount <= maxRetries) {
        const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient(originalRequest);
      }
      const networkError = new Error("Network error. Please check your connection.");
      (networkError as any).code = "NETWORK_ERROR";
      Sentry.captureException(error);
      return Promise.reject(networkError);
    }

    const status = error.response.status;

    if (status >= 500) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      if (originalRequest._retryCount <= maxRetries) {
        const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient(originalRequest);
      }
      const serverError = new Error("Server error. Please try again later.");
      (serverError as any).code = "SERVER_ERROR";
      Sentry.captureException(error);
      return Promise.reject(serverError);
    }

    if (status === 404) {
      const notFoundError = new Error("The requested resource was not found.");
      (notFoundError as any).code = "NOT_FOUND";
      return Promise.reject(notFoundError);
    }

    if (status === 403) {
      const forbiddenError = new Error("You do not have permission to perform this action.");
      (forbiddenError as any).code = "FORBIDDEN";
      return Promise.reject(forbiddenError);
    }

    if (status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/login" || originalRequest.url === "/auth/refresh") {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        return apiClient(originalRequest);
      } catch {
        if (typeof window !== "undefined" && !isRedirectingToLogin) {
          const locale = window.location.pathname.match(/^\/(en|ar)/)?.[1] || "ar";
          if (!window.location.pathname.endsWith(`/${locale}/login`)) {
            isRedirectingToLogin = true;
            window.location.href = `/${locale}/login`;
            if (redirectTimer) clearTimeout(redirectTimer);
            redirectTimer = setTimeout(resetRedirectFlag, 10000);
          }
        }
        return Promise.reject(error);
      }
    }

    Sentry.captureException(error);

    return Promise.reject(error);
  }
);
