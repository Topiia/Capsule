import axios from "axios";
import toast from "react-hot-toast";

// PRODUCTION SAFETY: Validate API URL configuration using Vite's built-in env
const getApiBaseURL = () => {
  const apiUrl = import.meta.env.VITE_API_URL;

  // CRITICAL: In production builds, API URL MUST be explicitly set
  // Vite sets import.meta.env.PROD = true in production builds
  if (import.meta.env.PROD && !apiUrl) {
    const errorMsg =
      "❌ CRITICAL: VITE_API_URL is not configured for production build!";
    console.error(errorMsg);
    console.error("Set VITE_API_URL in Vercel environment variables");
    console.error("Expected: https://capsule-backend.onrender.com/api");
    throw new Error("API URL not configured for production");
  }

  // In development, provide helpful fallback with warning
  // Vite sets import.meta.env.DEV = true in development
  if (import.meta.env.DEV && !apiUrl) {
    console.warn("⚠️ VITE_API_URL not set in .env file");
    console.warn("Falling back to: /api (using Vite Proxy)");
    console.warn("Create .env with: VITE_API_URL=/api");
    return "/api";
  }

  // Validate URL format (must start with http/https or be relative)
  if (
    !apiUrl.startsWith("http://") &&
    !apiUrl.startsWith("https://") &&
    !apiUrl.startsWith("/")
  ) {
    console.error(`❌ Invalid API URL format: ${apiUrl}`);
    console.error("URL must start with http://, https://, or /");
    throw new Error("Invalid API URL format");
  }

  // Log the final API URL (helps with debugging production issues)
  const envType = import.meta.env.PROD ? "PRODUCTION" : "DEVELOPMENT";
  console.log(`🔗 [${envType}] API Base URL: ${apiUrl}`);

  return apiUrl;
};

// Create axios instance with validated base URL
const api = axios.create({
  baseURL: getApiBaseURL(),
  // 30s global safety net — the backend should always respond well within this.
  // The real fix is the backend fire-and-forget fallback (< 500ms response).
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  // PRODUCTION FIX: Enable credentials (cookies) for cross-origin requests
  // Required for Vercel (frontend) → Render (backend) authentication
  // Browser will include cookies in requests and accept Set-Cookie headers
  withCredentials: true,
});

// Auth API methods
// COOKIE-ONLY AUTH: No Authorization header management needed
// Cookies are sent automatically by browser with withCredentials: true
export const authAPI = {
  // Auth endpoints
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  logout: () => api.post("/auth/logout"),
  getMe: () => api.get("/auth/me"),
  updateDetails: (userData) => api.put("/auth/updatedetails", userData),
  updatePassword: (passwordData) =>
    api.put("/auth/updatepassword", passwordData),
  // 60s override: extra safety net in case backend sync-fallback is temporarily
  // still blocking (e.g. before the fire-and-forget fix is deployed).
  forgotPassword: (email) =>
    api.post("/auth/forgotpassword", { email }, { timeout: 60000 }),
  resetPassword: (token, password) =>
    api.put(`/auth/resetpassword/${token}`, { password }),
  // COOKIE-ONLY AUTH: No body needed, refreshToken cookie sent automatically
  refreshToken: () => api.post("/auth/refresh"),
  verifyEmail: (token) => api.get(`/auth/verify/${token}`),
};

// Vlog API methods
export const vlogAPI = {
  getVlogs: (params = {}) => api.get("/vlogs", { params }),
  getVlog: (id) => api.get(`/vlogs/${id}`),
  createVlog: (vlogData) => api.post("/vlogs", vlogData),
  updateVlog: (id, vlogData) => api.put(`/vlogs/${id}`, vlogData),
  deleteVlog: (id) => api.delete(`/vlogs/${id}`),
  likeVlog: (id) => api.put(`/vlogs/${id}/like`),
  dislikeVlog: (id) => api.put(`/vlogs/${id}/dislike`),
  addComment: (id, comment) =>
    api.post(`/vlogs/${id}/comments`, { text: comment }),
  deleteComment: (id, commentId) =>
    api.delete(`/vlogs/${id}/comments/${commentId}`),
  shareVlog: (id) => api.put(`/vlogs/${id}/share`),
  recordView: (id) => api.put(`/vlogs/${id}/view`),
  getTrending: (params = {}) => api.get("/vlogs/trending", { params }),
  getUserVlogs: (userId, params = {}) =>
    api.get(`/vlogs/user/${userId}`, { params }),
  searchVlogs: (query, params = {}) =>
    api.get("/vlogs/search", { params: { ...params, q: query } }),
};

// Upload API methods
export const uploadAPI = {
  uploadSingle: (file) => {
    const formData = new FormData();
    formData.append("image", file);
    // CRITICAL: Remove Content-Type to let axios auto-set multipart/form-data with boundary
    // Default header 'application/json' prevents proper file upload
    return api.post("/upload/single", formData, {
      headers: { "Content-Type": undefined },
    });
  },
  uploadMultiple: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    // CRITICAL: Remove Content-Type to let axios auto-set multipart/form-data with boundary
    // Default header 'application/json' prevents proper file upload
    return api.post("/upload/multiple", formData, {
      headers: { "Content-Type": undefined },
    });
  },
  deleteImage: (publicId) => api.delete(`/upload/${publicId}`),
};

// User API methods
export const userAPI = {
  getUser: (username) => api.get(`/users/${username}`),
  getUserByUsername: (username) => api.get(`/users/profile/${username}`),
  followUser: (userId) => api.post(`/users/${userId}/follow`),
  unfollowUser: (userId) => api.delete(`/users/${userId}/follow`),
  getFollowers: (userId, params = {}) =>
    api.get(`/users/${userId}/followers`, { params }),
  getFollowing: (userId, params = {}) =>
    api.get(`/users/${userId}/following`, { params }),
  searchUsers: (query, params = {}) =>
    api.get("/users/search", { params: { ...params, q: query } }),
  getLikedVlogs: (params = {}) => api.get("/users/likes", { params }),
  getBookmarks: (params = {}) => api.get("/users/bookmarks", { params }),
  addBookmark: (vlogId) => api.post(`/users/bookmarks/${vlogId}`),
  removeBookmark: (vlogId) => api.delete(`/users/bookmarks/${vlogId}`),
  deleteAccount: (password) => api.delete("/users/me", { data: { password } }),
};

// Admin API methods
export const adminAPI = {
  getFlaggedVlogs: () => api.get("/admin/moderation/flagged"),
  overrideDecision: (id, status, reason) =>
    api.patch(`/admin/moderation/${id}/override`, { status, reason }),
  getMetrics: () => api.get("/admin/moderation/metrics"),
};

// Convenience: export deleteUserAccount for direct import
export const deleteUserAccount = userAPI.deleteAccount;

// Request interceptor for error handling
api.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching
    if (config.method === "get") {
      config.params = { ...config.params, _t: Date.now() };
    }

    // Initialize retry count if not present
    config.retryCount = config.retryCount || 0;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// State for preventing multiple refresh calls simultaneously
let isRefreshing = false;
let refreshQueue = [];

// Helper to resolve queued requests after token refresh
const processQueue = (error, token = null) => {
  refreshQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  refreshQueue = [];
};

// Response interceptor for error handling and retry logic
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle network errors with retry logic
    if (!error.response) {
      // Timeout handling - do NOT retry timeouts
      if (error.code === "ECONNABORTED") {
        error.message = "Request timed out. Server is not responding.";
        toast.error(error.message, { duration: 5000 });
        return Promise.reject(error);
      }

      // Check if we should retry (network errors only, not timeouts)
      const maxRetries = 2;
      const retryCount = originalRequest.retryCount || 0;

      if (retryCount < maxRetries) {
        originalRequest.retryCount = retryCount + 1;

        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry the request
        return api(originalRequest);
      }

      // Max retries reached (network error, not timeout)
      error.message = "Network error. Please check your connection.";
      toast.error(error.message, { duration: 5000 });
      return Promise.reject(error);
    }

    // Handle specific HTTP status codes
    const { status, data } = error.response;

    switch (status) {
      case 400:
        error.message =
          data.error?.message ||
          data.message ||
          "Invalid request. Please check your input.";
        break;

      case 401: {
        // Prevent refresh loops if the refresh call itself triggered 401
        if (originalRequest.url === "/auth/refresh") {
          error.message = "Your session has expired. Please log in again.";
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          
          const currentPath = window.location.pathname;
          // Only redirect if on protected route to avoid looping on public routes
          const protectedPrefixes = [
            "/dashboard",
            "/settings",
            "/create",
            "/edit",
            "/bookmarks",
            "/liked",
            "/admin",
          ];
          const isOnProtectedRoute = protectedPrefixes.some((prefix) =>
            currentPath.startsWith(prefix)
          );
          if (isOnProtectedRoute) {
            localStorage.setItem("redirectAfterLogin", currentPath);
            window.location.href = "/login";
          }
          break;
        }

        // Handle auto-refresh retry limit (only retry once per original request)
        if (!originalRequest._retry) {
          originalRequest._retry = true;

          // If another request is currently refreshing the token
          if (isRefreshing) {
            try {
              // Wait in queue until refresh is completed
              await new Promise((resolve, reject) => {
                refreshQueue.push({ resolve, reject });
              });
              // Refresh succeeded, replay this request
              return api(originalRequest);
            } catch (err) {
              // Refresh failed, fail this request as well
              return Promise.reject(err);
            }
          }

          // We are the first request to hit 401: lock others and run refresh
          isRefreshing = true;

          try {
            await authAPI.refreshToken();
            // Cookies are explicitly set by response header
            isRefreshing = false;
            processQueue(null);
            
            // Replay the original failed request
            return api(originalRequest);
          } catch (refreshErr) {
            isRefreshing = false;
            processQueue(refreshErr, null);
            
            // Allow switch statement fallback if refresh outright fails
            error.message = "Your session has expired. Please log in again.";
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            
            const currentPath = window.location.pathname;
            const protectedPrefixes = [
              "/dashboard",
              "/settings",
              "/create",
              "/edit",
              "/bookmarks",
              "/liked",
              "/admin",
            ];
            const isOnProtectedRoute = protectedPrefixes.some((prefix) =>
              currentPath.startsWith(prefix)
            );
            if (isOnProtectedRoute) {
              localStorage.setItem("redirectAfterLogin", currentPath);
              window.location.href = "/login";
            }
            return Promise.reject(refreshErr);
          }
        }

        // Already retried and failed again, fallback to original error logic
        error.message =
          data.error?.message ||
          data.message ||
          "Your session has expired. Please log in again.";

        // Clear auth data from localStorage
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");

        // Only hard-redirect to /login when the user is on a PROTECTED route.
        const currentPath = window.location.pathname;
        const protectedPrefixes = [
          "/dashboard",
          "/settings",
          "/create",
          "/edit",
          "/bookmarks",
          "/liked",
          "/admin",
        ];
        const isOnProtectedRoute = protectedPrefixes.some((prefix) =>
          currentPath.startsWith(prefix)
        );
        if (isOnProtectedRoute) {
          localStorage.setItem("redirectAfterLogin", currentPath);
          window.location.href = "/login";
        }

        break;
      }

      case 403:
        error.message =
          data.error?.message ||
          data.message ||
          "You don't have permission to perform this action.";
        break;

      case 404:
        error.message =
          data.error?.message || data.message || "Content not found.";
        break;

      case 429:
        error.message =
          data.error?.message ||
          data.message ||
          "Too many requests. Please try again later.";
        break;

      case 500:
        error.message =
          data.error?.message ||
          data.message ||
          "Server error. Please try again.";
        break;

      case 502:
        error.message = "Bad gateway. The server is temporarily unavailable.";
        break;

      case 503:
        error.message = "Service unavailable. Please try again later.";
        break;

      case 504:
        error.message = "Gateway timeout. The request took too long.";
        break;

      default:
        error.message =
          data.error?.message ||
          data.message ||
          "An unexpected error occurred. Please try again.";
    }

    return Promise.reject(error);
  },
);

export default api;
