/**
 * **Feature: vlog-interactions-complete, Property 10: Toast Notification Display**
 * **Validates: Requirements 5.4**
 * 
 * Property: For any completed interaction (success or failure), a toast notification 
 * should appear within 200 milliseconds with the appropriate message and type.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import * as fc from 'fast-check'
import { ToastProvider, useToast } from '../contexts/ToastContext'

describe('Toast Notification Display Property Test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  // Generator for toast types
  const toastTypeArbitrary = fc.constantFrom('success', 'error', 'info', 'warning')

  // Generator for toast messages (non-whitespace strings)
  const toastMessageArbitrary = fc.string({ minLength: 1, maxLength: 200 })
    .filter(str => str.trim().length > 0) // Exclude whitespace-only strings

  // Generator for toast durations (positive integers)
  const toastDurationArbitrary = fc.integer({ min: 100, max: 10000 })

  // Test component that uses the toast context
  const TestComponent = ({ onToastShown }) => {
    const { showToast } = useToast()
    
    // Expose showToast for testing
    if (onToastShown) {
      onToastShown(showToast)
    }
    
    return <div data-testid="test-component">Test Component</div>
  }

  it('should display toast notification within 200ms for any message and type', async () => {
    await fc.assert(
      fc.asyncProperty(
        toastMessageArbitrary,
        toastTypeArbitrary,
        async (message, type) => {
          let showToastFn = null
          
          // Render the ToastProvider with test component
          const { unmount } = render(
            <ToastProvider>
              <TestComponent 
                onToastShown={(fn) => { showToastFn = fn }}
              />
            </ToastProvider>
          )

          // Wait for component to mount and get showToast function
          await waitFor(() => {
            expect(showToastFn).not.toBeNull()
          })

          const startTime = performance.now()

          // Show the toast
          await act(async () => {
            showToastFn(message, type)
          })

          // Measure time until toast appears in DOM
          const toastElement = await waitFor(
            () => {
              const element = screen.getByText(message)
              expect(element).toBeInTheDocument()
              return element
            },
            { timeout: 300 }
          )

          const displayTime = performance.now() - startTime

          // Verify toast appears within 200ms
          expect(displayTime).toBeLessThanOrEqual(200)

          // Verify toast has correct message
          expect(toastElement).toHaveTextContent(message)

          // Verify toast container has appropriate styling based on type
          const toastContainer = toastElement.closest('div[class*="backdrop-blur"]')
          expect(toastContainer).toBeInTheDocument()
          
          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should display toast with correct type styling for any type', async () => {
    await fc.assert(
      fc.asyncProperty(
        toastMessageArbitrary,
        toastTypeArbitrary,
        async (message, type) => {
          let showToastFn = null

          const { unmount } = render(
            <ToastProvider>
              <TestComponent 
                onToastShown={(fn) => { showToastFn = fn }}
              />
            </ToastProvider>
          )

          await waitFor(() => {
            expect(showToastFn).not.toBeNull()
          })

          await act(async () => {
            showToastFn(message, type)
          })

          // Wait for toast to appear
          const toastElement = await waitFor(
            () => screen.getByText(message),
            { timeout: 300 }
          )

          // Verify the toast has the correct type-specific styling
          const toastContainer = toastElement.closest('div[class*="backdrop-blur"]')
          
          // Check for type-specific color classes
          const typeColorMap = {
            success: 'green',
            error: 'red',
            warning: 'yellow',
            info: 'blue'
          }

          const expectedColor = typeColorMap[type]
          const containerClasses = toastContainer.className

          // Verify type-specific color is present in classes
          expect(containerClasses).toMatch(new RegExp(expectedColor))
          
          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should auto-dismiss toast after specified duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        toastMessageArbitrary,
        toastTypeArbitrary,
        fc.integer({ min: 500, max: 2000 }), // Use shorter durations for testing
        async (message, type, duration) => {
          vi.useFakeTimers()
          let showToastFn = null

          const { unmount } = render(
            <ToastProvider>
              <TestComponent 
                onToastShown={(fn) => { showToastFn = fn }}
              />
            </ToastProvider>
          )

          await waitFor(() => {
            expect(showToastFn).not.toBeNull()
          })

          // Show toast with custom duration
          await act(async () => {
            showToastFn(message, type, duration)
          })

          // Verify toast appears
          await waitFor(
            () => screen.getByText(message),
            { timeout: 300 }
          )

          // Fast-forward time by the duration
          await act(async () => {
            vi.advanceTimersByTime(duration)
          })

          // Verify toast is removed after duration
          await waitFor(() => {
            expect(screen.queryByText(message)).not.toBeInTheDocument()
          })
          
          vi.useRealTimers()
          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should display multiple toasts simultaneously', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            message: toastMessageArbitrary,
            type: toastTypeArbitrary
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (toasts) => {
          let showToastFn = null

          const { unmount } = render(
            <ToastProvider>
              <TestComponent 
                onToastShown={(fn) => { showToastFn = fn }}
              />
            </ToastProvider>
          )

          await waitFor(() => {
            expect(showToastFn).not.toBeNull()
          })

          // Show all toasts
          await act(async () => {
            toasts.forEach(({ message, type }) => {
              showToastFn(message, type)
            })
          })

          // Verify all toasts appear within 200ms
          for (const { message } of toasts) {
            await waitFor(
              () => screen.getByText(message),
              { timeout: 300 }
            )
          }

          // Verify all toasts are visible simultaneously
          toasts.forEach(({ message }) => {
            expect(screen.getByText(message)).toBeInTheDocument()
          })
          
          unmount()
        }
      ),
      { numRuns: 50 }
    )
  })
})
