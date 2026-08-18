import axios, { AxiosError } from "axios";

// Portal BFF — same-origin /api on Vercel (rewritten to the EC2 portal BFF);
// SSR falls back to the EC2 host directly.
const API_BASE_URL =
  typeof window !== "undefined"
    ? "/api"
    : (process.env.NEXT_PUBLIC_API_URL || "http://13.50.176.4/api");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRedirectingToLogin = false;
let redirectTimer: ReturnType<typeof setTimeout> | null = null;

let isRefreshing = false;
let refreshSubscribers: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function onRefreshed() {
  for (const subscriber of refreshSubscribers) {
    subscriber.resolve(true);
  }
  refreshSubscribers = [];
}

function onRefreshFailed(error: unknown) {
  for (const subscriber of refreshSubscribers) {
    subscriber.reject(error);
  }
  refreshSubscribers = [];
}

function redirectToLogin() {
  if (typeof window !== "undefined" && !isRedirectingToLogin) {
    const locale = window.location.pathname.match(/^\/(en|ar)/)?.[1] || "ar";
    const erpBase = process.env.NEXT_PUBLIC_ERP_URL || window.location.origin;
    if (!window.location.pathname.endsWith(`/${locale}/login`)) {
      isRedirectingToLogin = true;
      window.location.href = `${erpBase}/${locale}/login`;
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = setTimeout(() => {
        isRedirectingToLogin = false;
        redirectTimer = null;
      }, 10000);
    }
  }
}

// Request interceptor — attach CSRF token to mutating requests
apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie("csrf_token");
  if (
    csrfToken &&
    ["post", "patch", "put", "delete"].includes(config.method?.toLowerCase() || "")
  ) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

// Response interceptor — 401 → refresh with portal refresh cookie
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

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
      const detail = (error.response?.data as any)?.detail;
      const serverError = new Error(detail || "Server error. Please try again later.");
      (serverError as any).code = "SERVER_ERROR";
      return Promise.reject(serverError);
    }

    if (status === 404) {
      const notFoundError = new Error("The requested resource was not found.");
      (notFoundError as any).code = "NOT_FOUND";
      return Promise.reject(notFoundError);
    }

    if (status === 403) {
      const isCsrfError = (error.response?.data as any)?.detail === "CSRF token mismatch";

      if (isCsrfError && !originalRequest._csrfRetried) {
        originalRequest._csrfRetried = true;
        try {
          await axios.get(`${API_BASE_URL}/auth/csrf`, { withCredentials: true });
          await new Promise((resolve) => setTimeout(resolve, 50));
          return apiClient(originalRequest);
        } catch {
          redirectToLogin();
          const sessionError = new Error("Session expired. Please log in again.");
          (sessionError as any).code = "SESSION_EXPIRED";
          return Promise.reject(sessionError);
        }
      }

      if (isCsrfError && originalRequest._csrfRetried) {
        redirectToLogin();
      }

      const forbiddenError = new Error("You do not have permission to perform this action.");
      (forbiddenError as any).code = "FORBIDDEN";
      return Promise.reject(forbiddenError);
    }

    if (status === 401) {
      if (
        originalRequest.url === "/auth/request-otp" ||
        originalRequest.url === "/auth/verify-otp" ||
        originalRequest.url === "/auth/refresh"
      ) {
        return Promise.reject(error);
      }

      if (originalRequest._retry) {
        redirectToLogin();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch(() => {
            redirectToLogin();
            return Promise.reject(error);
          });
      }

      isRefreshing = true;

      try {
        const csrfToken = getCookie("csrf_token");
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
          }
        );
        onRefreshed();
        return apiClient(originalRequest);
      } catch (refreshError) {
        onRefreshFailed(refreshError as Error);
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
