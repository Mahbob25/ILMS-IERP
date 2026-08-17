import * as Sentry from "@sentry/nextjs";
import axios, { AxiosError } from "axios";

const API_BASE_URL = typeof window !== "undefined"
  ? "/api/v1"
  : (process.env.NEXT_PUBLIC_API_URL || "http://13.50.176.4/api/v1");

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
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

function onRefreshed() {
  for (const subscriber of refreshSubscribers) {
    subscriber.resolve(true)
  }
  refreshSubscribers = []
}

function onRefreshFailed(error: unknown) {
  for (const subscriber of refreshSubscribers) {
    subscriber.reject(error)
  }
  refreshSubscribers = []
}

function redirectToLogin() {
  if (typeof window !== "undefined" && !isRedirectingToLogin) {
    const pathname = window.location.pathname;
    const locale = pathname.match(/^\/(en|ar)/)?.[1] || "ar";

    // Never redirect away from public pages (landing page and its locale
    // variants). A failed /users/me (401, no session) on the public landing
    // must not yank the visitor to /login.
    const cleanPath = pathname.replace(`/${locale}`, "") || "/";
    if (cleanPath === "/") return;

    if (!pathname.endsWith(`/${locale}/login`)) {
      isRedirectingToLogin = true;
      window.location.href = `/${locale}/login`;
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = setTimeout(() => {
        isRedirectingToLogin = false;
        redirectTimer = null;
      }, 10000);
    }
  }
}

function resetRedirectFlag() {
  isRedirectingToLogin = false;
  redirectTimer = null;
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

// Response interceptor
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
      const detail = (error.response?.data as any)?.detail;
      const serverError = new Error(detail || "Server error. Please try again later.");
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
      if (originalRequest.url === "/auth/login" || originalRequest.url === "/auth/refresh") {
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
        }).then(() => apiClient(originalRequest)).catch(() => {
          redirectToLogin();
          return Promise.reject(error);
        });
      }

      isRefreshing = true;

      try {
        const csrfToken = getCookie('csrf_token');
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
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

    Sentry.captureException(error);

    return Promise.reject(error);
  }
);
