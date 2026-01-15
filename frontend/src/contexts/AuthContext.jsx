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
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'))
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Memoize logout first as others might depend on it (and it's used in effects)
  const logout = useCallback(async () => {
    try {
      if (token) {
        await authAPI.logout()
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear all data
      setUser(null)
      setToken(null)
      setRefreshToken(null)
      setIsAuthenticated(false)

      // Clear storage
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('refreshToken')

      // Clear auth header
      authAPI.setAuthHeader(null)

      toast.success('Logged out successfully')
    }
  }, [token]) // token is used in `if (token)`

  const login = useCallback(async (email, password, rememberMe = false) => {
    try {
      const response = await authAPI.login({ email, password, rememberMe })
      const { token: newToken, refreshToken: newRefreshToken, user: userData } = response.data

      setToken(newToken)
      setRefreshToken(newRefreshToken)
      setUser(userData)
      setIsAuthenticated(true)

      // Store tokens
      if (rememberMe) {
        localStorage.setItem('token', newToken)
        localStorage.setItem('refreshToken', newRefreshToken)
      } else {
        sessionStorage.setItem('token', newToken)
        sessionStorage.setItem('refreshToken', newRefreshToken)
      }

      // Set auth header
      authAPI.setAuthHeader(newToken)

      toast.success('Welcome back!')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error?.message || 'Login failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }, []) // No external dependencies from component state

  const register = useCallback(async (userData) => {
    try {
      const response = await authAPI.register(userData)
      const { token: newToken, refreshToken: newRefreshToken, user: userInfo } = response.data

      setToken(newToken)
      setRefreshToken(newRefreshToken)
      setUser(userInfo)
      setIsAuthenticated(true)

      // Store tokens
      localStorage.setItem('token', newToken)
      localStorage.setItem('refreshToken', newRefreshToken)

      // Set auth header
      authAPI.setAuthHeader(newToken)

      toast.success('Account created successfully!')
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error?.message || 'Registration failed'
      toast.error(message)
      return { success: false, error: message }
    }
  }, []) // No external dependencies from component state

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
  }, []) // No external dependencies from component state

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
  }, []) // No external dependencies from component state

  // Check if user is authenticated on mount
  useEffect(() => {
    const initAuth = async () => {
      // Try to recover session if we have tokens
      // Read directly from storage for initial check, as state `token` and `refreshToken` might be null initially
      const storedToken = localStorage.getItem('token') || sessionStorage.getItem('token')
      const storedRefreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken')

      if (storedToken || storedRefreshToken) {
        try {
          // 1. Try with current access token if available
          if (storedToken) {
            authAPI.setAuthHeader(storedToken)
            const response = await authAPI.getMe()
            setUser(response.data.user)
            setToken(storedToken) // Ensure state is updated if token came from storage
            setIsAuthenticated(true)
          } else {
            // No access token, force refresh flow
            throw new Error('No access token')
          }
        } catch (error) {
          // 2. If access token failed (401) or missing, try refresh token
          if (storedRefreshToken) {
            try {
              console.log('Access token expired or missing, attempting refresh...')
              const response = await authAPI.refreshToken(storedRefreshToken)
              const { accessToken, refreshToken: newRefreshToken, user: userData } = response.data

              // Update state
              setToken(accessToken)
              setRefreshToken(newRefreshToken)
              setUser(userData)
              setIsAuthenticated(true)
              authAPI.setAuthHeader(accessToken)

              // Update storage (respecting where it was found, default to localStorage if both missing)
              if (sessionStorage.getItem('refreshToken')) {
                sessionStorage.setItem('token', accessToken)
                sessionStorage.setItem('refreshToken', newRefreshToken)
              } else {
                localStorage.setItem('token', accessToken)
                localStorage.setItem('refreshToken', newRefreshToken)
              }
            } catch (refreshError) {
              console.error('Session recovery failed:', refreshError)
              logout()
            }
          } else {
            // No refresh token to fallback on
            logout()
          }
        }
      }
      setLoading(false)
    }

    initAuth()
  }, [logout]) // Depend on logout as it's called within initAuth

  // Auto refresh token before expiration
  useEffect(() => {
    if (refreshToken) {
      const refreshInterval = setInterval(async () => {
        try {
          const response = await authAPI.refreshToken(refreshToken)
          const { accessToken, refreshToken: newRefreshToken } = response.data

          setToken(accessToken)
          setRefreshToken(newRefreshToken)
          localStorage.setItem('token', accessToken)
          localStorage.setItem('refreshToken', newRefreshToken)
          authAPI.setAuthHeader(accessToken)
        } catch (error) {
          console.error('Token refresh failed:', error)

          // SECURITY: Check if session was revoked due to security violation
          const errorMessage = error.response?.data?.error?.message || ''
          if (errorMessage.includes('revoked') || errorMessage.includes('reuse')) {
            toast.error('Your session was revoked for security reasons. Please log in again.', {
              duration: 6000
            })
          }

          logout()
        }
      }, 25 * 60 * 1000) // Refresh every 25 minutes

      return () => clearInterval(refreshInterval)
    }
  }, [refreshToken, logout])

  const value = {
    user,
    token,
    refreshToken,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    updatePassword
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}