/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
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
          case 429:
            message = 'Too many login attempts. Please try again in a few minutes.'
            errorType = 'ratelimit'
            break
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
  // Cookies sent automatically by browser with withCredentials: true
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Try to get current user (cookie sent automatically)
        const response = await authAPI.getMe()
        setUser(response.data.user)
        setIsAuthenticated(true)
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
            // Refresh failed, user not logged in
            console.log('Session restoration failed, user not logged in')
            setIsAuthenticated(false)
          }
        } else {
          // Other error, assume not logged in
          setIsAuthenticated(false)
        }
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, []) // No dependencies, run once on mount

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    updatePassword,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}