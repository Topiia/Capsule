/**
 * **Feature: forgot-password-ui, Property 2: Invalid email format prevents submission**
 * **Validates: Requirements 1.3**
 * 
 * Property: For any string that does not match valid email format, when entered 
 * in the forgot password form, the application should display a validation error 
 * and prevent the API call from being made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import ForgotPassword from '../pages/Auth/ForgotPassword'
import * as fc from 'fast-check'
import { authAPI } from '../services/api'

// Mock the API
vi.mock('../services/api', () => ({
  authAPI: {
    forgotPassword: vi.fn(),
    setAuthHeader: vi.fn(),
    getMe: vi.fn()
  }
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
global.localStorage = localStorageMock

describe('ForgotPassword Email Validation Property Test', () => {
  let queryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  const renderForgotPassword = () => {
    // Clean up any previous renders
    document.body.innerHTML = ''
    
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/forgot-password']}>
            <ForgotPassword />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )
  }

  // Generator for invalid email strings
  // These are strings that should NOT match the email pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const invalidEmailArbitrary = fc.oneof(
    // Empty string
    fc.constant(''),
    // No @ symbol (non-whitespace)
    fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => !s.includes('@') && s.trim().length > 0),
    // Multiple @ symbols
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0)
    ).map(([a, b, c]) => `${a}@@${b}@${c}`),
    // Missing domain part (no dot after @)
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => !s.includes('@') && !s.includes('.') && s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => !s.includes('@') && !s.includes('.') && s.trim().length > 0)
    ).map(([local, domain]) => `${local}@${domain}`),
    // @ at the beginning
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => `@${s}`),
    // @ at the end
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => `${s}@`),
    // Only @ symbol
    fc.constant('@'),
    // Whitespace in email
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0)
    ).map(([a, b, c]) => `${a} ${b}@${c}.com`),
    // Missing local part
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => `@${s}.com`),
    // Dot immediately after @
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => `${s}@.com`),
    // Dot immediately before @
    fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0)
      .map(s => `${s}.@domain.com`)
  )

  it('should display validation error and prevent API call for any invalid email format', async () => {
    await fc.assert(
      fc.asyncProperty(invalidEmailArbitrary, async (invalidEmail) => {
        const user = userEvent.setup()
        const { container, unmount } = renderForgotPassword()

        try {
          // Find the email input
          const emailInput = container.querySelector('#email')
          expect(emailInput).toBeTruthy()

          // Find the submit button using container query to avoid multiple elements issue
          const submitButton = container.querySelector('button[type="submit"]')
          expect(submitButton).toBeTruthy()

          // Clear any previous API calls
          authAPI.forgotPassword.mockClear()

          // Enter the invalid email
          await user.clear(emailInput)
          await user.type(emailInput, invalidEmail)

          // Try to submit the form
          await user.click(submitButton)

          // Wait a bit to ensure any async validation completes
          await waitFor(() => {
            // The API should NOT have been called
            expect(authAPI.forgotPassword).not.toHaveBeenCalled()
          }, { timeout: 1000 })

          // Verify that a validation error is displayed
          // The error should be either "Email is required" or "Invalid email address"
          await waitFor(() => {
            const errorMessage = container.querySelector('.text-red-400')
            expect(errorMessage).toBeTruthy()
            expect(errorMessage.textContent).toMatch(/email is required|invalid email address/i)
          }, { timeout: 1000 })
        } finally {
          // Clean up after each test
          unmount()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('should handle empty email submission', async () => {
    const user = userEvent.setup()
    const { container } = renderForgotPassword()

    const emailInput = container.querySelector('#email')
    const submitButton = screen.getByRole('button', { name: /send reset link/i })

    // Clear the input (ensure it's empty)
    await user.clear(emailInput)

    // Try to submit with empty email
    await user.click(submitButton)

    // Wait for validation error
    await waitFor(() => {
      const errorMessage = screen.getByText(/email is required/i)
      expect(errorMessage).toBeTruthy()
    })

    // API should not be called
    expect(authAPI.forgotPassword).not.toHaveBeenCalled()
  })

  it('should handle emails without @ symbol', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 })
          .filter(s => !s.includes('@') && s.trim().length > 0),
        async (emailWithoutAt) => {
          const user = userEvent.setup()
          const { container, unmount } = renderForgotPassword()

          try {
            const emailInput = container.querySelector('#email')
            const submitButton = container.querySelector('button[type="submit"]')

            authAPI.forgotPassword.mockClear()

            await user.clear(emailInput)
            await user.type(emailInput, emailWithoutAt)
            await user.click(submitButton)

            await waitFor(() => {
              expect(authAPI.forgotPassword).not.toHaveBeenCalled()
            }, { timeout: 1000 })

            await waitFor(() => {
              const errorMessage = container.querySelector('.text-red-400')
              expect(errorMessage).toBeTruthy()
              expect(errorMessage.textContent).toMatch(/invalid email address/i)
            }, { timeout: 1000 })
          } finally {
            unmount()
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should handle emails without domain extension', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('@') && !s.includes('.') && s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('@') && !s.includes('.') && s.trim().length > 0)
        ),
        async ([local, domain]) => {
          const invalidEmail = `${local}@${domain}`
          const user = userEvent.setup()
          const { container, unmount } = renderForgotPassword()

          try {
            const emailInput = container.querySelector('#email')
            const submitButton = container.querySelector('button[type="submit"]')

            authAPI.forgotPassword.mockClear()

            await user.clear(emailInput)
            await user.type(emailInput, invalidEmail)
            await user.click(submitButton)

            await waitFor(() => {
              expect(authAPI.forgotPassword).not.toHaveBeenCalled()
            }, { timeout: 1000 })

            await waitFor(() => {
              const errorMessage = container.querySelector('.text-red-400')
              expect(errorMessage).toBeTruthy()
              expect(errorMessage.textContent).toMatch(/invalid email address/i)
            }, { timeout: 1000 })
          } finally {
            unmount()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
