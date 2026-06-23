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

// Response interceptor to handle global auth failures (e.g. 401 redirects)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if error is 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === "/auth/login" || originalRequest.url === "/auth/refresh") {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        // Attempt to silent refresh session cookies
        await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (typeof window !== "undefined") {
          const locale = window.location.pathname.match(/^\/(en|ar)/)?.[1] || "ar";
          if (!window.location.pathname.includes("/login")) {
            window.location.href = `/${locale}/login`;
          }
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
