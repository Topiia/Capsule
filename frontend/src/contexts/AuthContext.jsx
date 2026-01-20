/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// CRITICAL FIX: Global singleton guard to prevent duplicate auth initialization
// Using module-level variable instead of useRef to persist across ALL instances
// This prevents multiple /me requests even with multiple AuthProvider instances or re-renders
let globalAuthInitialized = false;
let globalAuthInitializing = false;

/*
  ============================================================
  AUTO TOKEN REFRESH (TEMPORARILY DISABLED)
  ============================================================

  Reason:
  - Backend currently uses long-lived access tokens (~7 days).
  - Auto-refreshing every few minutes is unnecessary in this setup and adds
    extra requests + complexity.
  - Refresh failures (network/CORS/cookie issues) could cause avoidable logouts.

  Enable later ONLY when:
  - Access token expiry is short-lived (15–30 minutes), which is the recommended
    production security model.
  - CORS + cookie settings (SameSite/Secure/Domain) are verified in production.

  Future improvement:
  - Prefer refresh-on-demand (refresh on 401 + retry request) over fixed intervals.
*/
const ENABLE_AUTO_TOKEN_REFRESH = false;

export const AuthProvider = ({ children }) => {
  // COOKIE-ONLY AUTH: No token state needed, cookies handled by browser
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Logout: Call API to clear cookies, then clear state
  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear user state
      setUser(null)
      setIsAuthenticated(false)

      toast.success('Logged out successfully')
    }
  }, [])

  // Login: No localStorage needed, cookies set by server automatically
  const login = useCallback(async (email, password, rememberMe = false) => {
    try {
      const response = await authAPI.login({ email, password, rememberMe })
      const { user: userData } = response.data

      // Update state (cookies set automatically by server)
      setUser(userData)
      setIsAuthenticated(true)

      toast.success('Welcome back!')
      return { success: true }
    } catch (error) {
      // Enhanced error handling for all failure types
      let message = 'Login failed. Please try again.'
      let errorType = 'unknown'

      // Network errors (server unreachable, CORS, timeout)
      if (!error.response) {
        if (error.message === 'Network Error') {
          message = 'Unable to connect to server. Please check your internet connection.'
          errorType = 'network'
        } else if (error.code === 'ECONNABORTED') {
          message = 'Request timed out. Please try again.'
          errorType = 'timeout'
        } else {
          message = 'Connection failed. Please check if the server is running.'
          errorType = 'connection'
        }
      } else if (error.response) {
        // HTTP errors with response
        const status = error.response.status
        const serverMessage = error.response.data?.error?.message || error.response.data?.message

        switch (status) {
          case 401:
            message = serverMessage || 'Invalid email or password. Please try again.'
            errorType = 'auth'
            break
          case 400:
            message = serverMessage || 'Please provide valid email and password.'
            errorType = 'validation'
            break
          case 429: {
            const retryAfter = error.response.data?.retryAfterSeconds || 900 // 15 min default
            const minutes = Math.ceil(retryAfter / 60)
            message = `Too many login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`
            errorType = 'ratelimit'
            break
          }
          case 500:
          case 502:
          case 503:
            message = 'Server error. Please try again later.'
            errorType = 'server'
            break
          default:
            message = serverMessage || 'An unexpected error occurred. Please try again.'
            errorType = 'other'
        }
      }

      // Log error for debugging
      console.error('Login error:', { errorType, status: error.response?.status, message })

      toast.error(message, { duration: 5000 })
      return { success: false, error: message, errorType }
    }
  }, [])

  // Register: Same as login, cookies set automatically
  const register = useCallback(async (userData) => {
    try {
      const response = await authAPI.register(userData)
      const { user: userInfo } = response.data

      // Update state (cookies set automatically by server)
      setUser(userInfo)
      setIsAuthenticated(true)

      toast.success('Account created successfully!')
      return { success: true }
    } catch (error) {
      // Enhanced error handling
      let message = 'Registration failed. Please try again.'

      // Network errors
      if (!error.response) {
        if (error.message === 'Network Error') {
          message = 'Unable to connect to server. Please check your internet connection.'
        } else {
          message = 'Connection failed. Please check if the server is running.'
        }
      } else if (error.response) {
        // HTTP errors with response
        const status = error.response.status
        const serverMessage = error.response.data?.error?.message || error.response.data?.message

        switch (status) {
          case 400:
            message = serverMessage || 'User already exists or invalid data provided.'
            break
          case 429:
            message = 'Too many registration attempts. Please try again later.'
            break
          case 500:
          case 502:
          case 503:
            message = 'Server error. Please try again later.'
            break
          default:
            message = serverMessage || 'Registration failed. Please try again.'
        }
      }

      console.error('Registration error:', { status: error.response?.status, message })

      toast.error(message, { duration: 5000 })
      return { success: false, error: message }
    }
  }, [])

  const updateUser = useCallback(async (userData) => {
    try {
      const response = await authAPI.updateDetails(userData)
      setUser(response.data.user)
      toast.success('Profile updated successfully')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error?.message || 'Update failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }, [])

  const updatePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      await authAPI.updatePassword({ currentPassword, newPassword })
      toast.success('Password updated successfully')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error?.message || 'Password update failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }, [])

  // COOKIE-ONLY AUTH: Session restoration via /me endpoint
  // CRITICAL: Global singleton guard prevents duplicate requests
  useEffect(() => {
    const initAuth = async () => {
      // PRODUCTION FIX: Check global flag first (prevents duplicate requests)
      if (globalAuthInitializing || globalAuthInitialized) {
        console.log('[AuthContext] Skipping duplicate auth initialization')
        // Still need to set loading to false for this instance
        setLoading(false)
        return
      }

      globalAuthInitializing = true
      console.log('[AuthContext] Initializing authentication...')

      try {
        // Try to get current user (cookie sent automatically)
        const response = await authAPI.getMe()
        setUser(response.data.user)
        setIsAuthenticated(true)
        console.log('[AuthContext] User authenticated via session cookie')
      } catch (error) {
        // If 401, try to refresh token
        if (error.response?.status === 401) {
          try {
            console.log('Access token expired, attempting refresh...')
            // No body needed - refreshToken cookie sent automatically
            await authAPI.refreshToken()

            // After refresh, fetch user again
            const userResponse = await authAPI.getMe()
            setUser(userResponse.data.user)
            setIsAuthenticated(true)

            console.log('Session restored via refresh token')
          } catch (refreshError) {
            // Check if it's a rate limit error
            if (refreshError.response?.status === 429) {
              const retryAfter = refreshError.response.data?.retryAfterSeconds || 60
              console.warn(`Rate limited. Retry after ${retryAfter} seconds`)
              toast.error(
                `Too many requests. Please wait ${retryAfter} seconds and refresh.`,
                { duration: retryAfter * 1000 }
              )
            } else {
              // Refresh failed, user not logged in
              console.log('Session restoration failed, user not logged in')
            }
            setIsAuthenticated(false)
          }
        } else if (error.response?.status === 429) {
          // Rate limit on initial /me call
          const retryAfter = error.response.data?.retryAfterSeconds || 60
          console.warn(`Rate limited on /me. Retry after ${retryAfter} seconds`)
          toast.error(
            `Too many requests. Please wait ${retryAfter} seconds.`,
            { duration: retryAfter * 1000 }
          )
          setIsAuthenticated(false)
        } else {
          // Other error, assume not logged in
          console.log('[AuthContext] No active session')
          setIsAuthenticated(false)
        }
      } finally {
        setLoading(false)
        globalAuthInitializing = false
        globalAuthInitialized = true
        console.log('[AuthContext] Authentication initialization complete')
      }
    }

    initAuth()
  }, []) // No dependencies, run once on mount



  // PRODUCTION: Automatic token refresh to prevent session expiration during active use
  // Refreshes every 6 minutes with retry logic for transient failures
  useEffect(() => {
    // Feature flag: Disabled until backend uses short-lived access tokens
    if (!ENABLE_AUTO_TOKEN_REFRESH) return;

    // Only run refresh interval when user is authenticated
    if (!isAuthenticated) return;

    console.log('[Auth] Starting automatic token refresh interval (every 6 minutes)');

    const refreshInterval = setInterval(async () => {
      // Attempt 1: Try refresh
      try {
        await authAPI.refreshToken();
        console.log('[Auth] Token refreshed successfully');
        return; // Success, exit early
      } catch (firstError) {
        console.warn('[Auth] Refresh attempt 1 failed, retrying in 1 second...');
        toast.info('Connection issue. Retrying session refresh...', { duration: 2000 });

        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Attempt 2: Retry once
        try {
          await authAPI.refreshToken();
          console.log('[Auth] Token refreshed successfully (retry)');
          return; // Success on retry, exit
        } catch (secondError) {
          // Both attempts failed - classify error type
          const isNetworkError = !secondError.response;
          const isServerError = secondError.response?.status >= 500;
          const isAuthError = secondError.response?.status === 401;

          if (isNetworkError || isServerError) {
            // Transient failure - warn user but DON'T logout
            console.warn('[Auth] Refresh failed due to network/server issue. User can continue.', {
              isNetworkError,
              status: secondError.response?.status,
            });
            toast.warning('Unable to refresh session. Please check your connection.', {
              duration: 4000,
            });
          } else if (isAuthError) {
            // Real auth failure (token revoked, expired, reuse detected) - logout required
            const message = secondError.response?.data?.error?.message || 'Session expired';
            console.error('[Auth] Session invalidated:', message);
            toast.error('Session expired. Please log in again.', { duration: 5000 });
            await logout();
          } else {
            // Other errors - log but don't logout
            console.warn('[Auth] Unexpected refresh error:', secondError.response?.status);
          }
        }
      }
    }, 6 * 60 * 1000); // 6 minutes (360,000ms)

    // Cleanup: Clear interval on unmount or when authentication state changes
    return () => {
      console.log('[Auth] Clearing automatic token refresh interval');
      clearInterval(refreshInterval);
    };
  }, [isAuthenticated, logout])

  // PERFORMANCE: Memoize context value to prevent unnecessary rerenders
  // Only recreate when dependencies actually change
  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    updatePassword,
  }), [user, loading, isAuthenticated, login, register, logout, updateUser, updatePassword])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}