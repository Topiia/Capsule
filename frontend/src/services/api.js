import axios from 'axios'

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Auth API methods
export const authAPI = {
  // Set auth header
  setAuthHeader: (token) => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  },

  // Auth endpoints
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateDetails: (userData) => api.put('/auth/updatedetails', userData),
  updatePassword: (passwordData) => api.put('/auth/updatepassword', passwordData),
  forgotPassword: (email) => api.post('/auth/forgotpassword', { email }),
  resetPassword: (token, password) => api.put(`/auth/resetpassword/${token}`, { password }),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  verifyEmail: (token) => api.get(`/auth/verify/${token}`),
}

// Vlog API methods
export const vlogAPI = {
  getVlogs: (params = {}) => api.get('/vlogs', { params }),
  getVlog: (id) => api.get(`/vlogs/${id}`),
  createVlog: (vlogData) => api.post('/vlogs', vlogData),
  updateVlog: (id, vlogData) => api.put(`/vlogs/${id}`, vlogData),
  deleteVlog: (id) => api.delete(`/vlogs/${id}`),
  likeVlog: (id) => api.put(`/vlogs/${id}/like`),
  dislikeVlog: (id) => api.put(`/vlogs/${id}/dislike`),
  addComment: (id, comment) => api.post(`/vlogs/${id}/comments`, { text: comment }),
  deleteComment: (id, commentId) => api.delete(`/vlogs/${id}/comments/${commentId}`),
  shareVlog: (id) => api.put(`/vlogs/${id}/share`),
  recordView: (id) => api.put(`/vlogs/${id}/view`),
  getTrending: (params = {}) => api.get('/vlogs/trending', { params }),
  getUserVlogs: (userId, params = {}) => api.get(`/vlogs/user/${userId}`, { params }),
  searchVlogs: (query, params = {}) => api.get('/vlogs/search', { params: { ...params, q: query } }),
}

// Upload API methods
export const uploadAPI = {
  uploadSingle: (file) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post('/upload/single', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadMultiple: (files) => {
    const formData = new FormData()
    files.forEach(file => formData.append('images', file))
    return api.post('/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteImage: (publicId) => api.delete(`/upload/${publicId}`),
}

// User API methods
export const userAPI = {
  getUser: (username) => api.get(`/users/${username}`),
  getUserByUsername: (username) => api.get(`/users/profile/${username}`),
  followUser: (userId) => api.post(`/users/${userId}/follow`),
  unfollowUser: (userId) => api.delete(`/users/${userId}/follow`),
  getFollowers: (userId, params = {}) => api.get(`/users/${userId}/followers`, { params }),
  getFollowing: (userId, params = {}) => api.get(`/users/${userId}/following`, { params }),
  searchUsers: (query, params = {}) => api.get('/users/search', { params: { ...params, q: query } }),
  getLikedVlogs: (params = {}) => api.get('/users/likes', { params }),
  getBookmarks: (params = {}) => api.get('/users/bookmarks', { params }),
  addBookmark: (vlogId) => api.post(`/users/bookmarks/${vlogId}`),
  removeBookmark: (vlogId) => api.delete(`/users/bookmarks/${vlogId}`),
}

// Request interceptor for error handling
api.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching
    if (config.method === 'get') {
      config.params = { ...config.params, _t: Date.now() }
    }

    // Initialize retry count if not present
    config.retryCount = config.retryCount || 0

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling and retry logic
api.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Handle network errors with retry logic
    if (!error.response) {
      // Check if we should retry
      const maxRetries = 2
      const retryCount = originalRequest.retryCount || 0

      if (retryCount < maxRetries) {
        originalRequest.retryCount = retryCount + 1

        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay))

        // Retry the request
        return api(originalRequest)
      }

      // Max retries reached
      error.message = 'Network error. Please check your connection.'
      return Promise.reject(error)
    }

    // Handle specific HTTP status codes
    const { status, data } = error.response

    switch (status) {
      case 400:
        error.message = data.error?.message || data.message || 'Invalid request. Please check your input.'
        break

      case 401: {
        error.message = data.error?.message || data.message || 'Your session has expired. Please log in again.'

        // Clear auth data on 401
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')

        // Store current location for redirect after login
        const currentPath = window.location.pathname
        if (currentPath !== '/login' && currentPath !== '/register') {
          localStorage.setItem('redirectAfterLogin', currentPath)
        }

        // Redirect to login page
        window.location.href = '/login'
        break
      }

      case 403:
        error.message = data.error?.message || data.message || "You don't have permission to perform this action."
        break

      case 404:
        error.message = data.error?.message || data.message || 'Content not found.'
        break

      case 429:
        error.message = data.error?.message || data.message || 'Too many requests. Please try again later.'
        break

      case 500:
        error.message = data.error?.message || data.message || 'Server error. Please try again.'
        break

      case 502:
        error.message = 'Bad gateway. The server is temporarily unavailable.'
        break

      case 503:
        error.message = 'Service unavailable. Please try again later.'
        break

      case 504:
        error.message = 'Gateway timeout. The request took too long.'
        break

      default:
        error.message = data.error?.message || data.message || 'An unexpected error occurred. Please try again.'
    }

    return Promise.reject(error)
  }
)

export default api