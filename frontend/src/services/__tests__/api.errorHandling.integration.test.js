import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import MockAdapter from 'axios-mock-adapter'

describe('API Error Handling Integration Tests', () => {
  let mock
  let api

  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear()

    // Mock window.location
    delete window.location
    window.location = { href: '', pathname: '/test' }

    // Clear module cache and reimport
    vi.resetModules()

    // Import fresh api instance
    const apiModule = await import('../api')
    api = apiModule.default

    // Create mock adapter
    mock = new MockAdapter(api, { delayResponse: 0 })
  })

  afterEach(() => {
    mock.restore()
    vi.clearAllMocks()
  })

  describe('HTTP Status Code Error Messages', () => {
    it('should handle 400 Bad Request with specific message', async () => {
      mock.onGet('/test').reply(400, { error: { message: 'Invalid input data' } })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Invalid input data')
      }
    })

    it('should handle 400 with fallback message format', async () => {
      mock.onGet('/test').reply(400, { message: 'Bad request data' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Bad request data')
      }
    })

    it('should handle 401 Unauthorized and clear auth data', async () => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('refreshToken', 'test-refresh')
      window.location.pathname = '/dashboard'

      mock.onGet('/test').reply(401, { message: 'Token expired' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Token expired')
        expect(localStorage.getItem('token')).toBeNull()
        expect(localStorage.getItem('refreshToken')).toBeNull()
        expect(window.location.href).toBe('/login')
      }
    })

    it('should store redirect path on 401 error', async () => {
      window.location.pathname = '/bookmarks'

      mock.onGet('/test').reply(401, { message: 'Unauthorized' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(localStorage.getItem('redirectAfterLogin')).toBe('/bookmarks')
      }
    })

    it('should not store redirect path for login page', async () => {
      window.location.pathname = '/login'

      mock.onGet('/test').reply(401, { message: 'Unauthorized' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(localStorage.getItem('redirectAfterLogin')).toBeNull()
      }
    })

    it('should not store redirect path for register page', async () => {
      window.location.pathname = '/register'

      mock.onGet('/test').reply(401, { message: 'Unauthorized' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(localStorage.getItem('redirectAfterLogin')).toBeNull()
      }
    })

    it('should handle 403 Forbidden with specific message', async () => {
      mock.onGet('/test').reply(403, { error: { message: 'Access denied' } })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Access denied')
      }
    })

    it('should handle 403 with default message', async () => {
      mock.onGet('/test').reply(403, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe("You don't have permission to perform this action.")
      }
    })

    it('should handle 404 Not Found with default message', async () => {
      mock.onGet('/test').reply(404, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Content not found.')
      }
    })

    it('should handle 429 Too Many Requests', async () => {
      mock.onGet('/test').reply(429, { message: 'Rate limit exceeded' })

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Rate limit exceeded')
      }
    })

    it('should handle 429 with default message', async () => {
      mock.onGet('/test').reply(429, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Too many requests. Please try again later.')
      }
    })

    it('should handle 500 Server Error', async () => {
      mock.onGet('/test').reply(500, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Server error. Please try again.')
      }
    })

    it('should handle 502 Bad Gateway', async () => {
      mock.onGet('/test').reply(502, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Bad gateway. The server is temporarily unavailable.')
      }
    })

    it('should handle 503 Service Unavailable', async () => {
      mock.onGet('/test').reply(503, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Service unavailable. Please try again later.')
      }
    })

    it('should handle 504 Gateway Timeout', async () => {
      mock.onGet('/test').reply(504, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Gateway timeout. The request took too long.')
      }
    })

    it('should handle unknown status codes with generic message', async () => {
      mock.onGet('/test').reply(418, {})

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('An unexpected error occurred. Please try again.')
      }
    })
  })

  describe('Network Error Handling', () => {
    it('should handle network errors with appropriate message', async () => {
      mock.onGet('/test').networkError()

      try {
        await api.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('Network error. Please check your connection.')
      }
    })

    it('should retry network errors up to 2 times before failing', async () => {
      // Use networkError() to properly simulate network failure
      mock.onGet('/test-retry').networkError()

      const startTime = Date.now()

      try {
        await api.get('/test-retry')
        expect.fail('Should have thrown an error')
      } catch (error) {
        const duration = Date.now() - startTime

        // With exponential backoff (1s + 2s), should take at least 3 seconds
        // This proves retries happened
        expect(duration).toBeGreaterThanOrEqual(2900) // Allow some margin
        expect(error.message).toBe('Network error. Please check your connection.')
      }
    }, 10000) // Increase timeout for retry delays

    it('should succeed on retry if network recovers', async () => {


      // First call fails, second succeeds
      mock.onGet('/test-recover')
        .networkErrorOnce()
        .onGet('/test-recover')
        .reply(200, { success: true, data: 'recovered' })

      const response = await api.get('/test-recover')

      // Should have succeeded after retry
      expect(response.data.success).toBe(true)
      expect(response.data.data).toBe('recovered')
    }, 10000) // Increase timeout for retry delays
  })

  describe('Request Interceptor', () => {
    it('should add timestamp to GET requests', async () => {
      mock.onGet('/test').reply((config) => {
        expect(config.params._t).toBeDefined()
        expect(typeof config.params._t).toBe('number')
        return [200, { success: true }]
      })

      await api.get('/test')
    })

    it('should initialize retry count on requests', async () => {
      mock.onGet('/test').reply((config) => {
        expect(config.retryCount).toBe(0)
        return [200, { success: true }]
      })

      await api.get('/test')
    })
  })
})
