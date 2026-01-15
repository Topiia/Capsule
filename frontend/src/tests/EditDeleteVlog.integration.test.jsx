import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import EditVlog from '../pages/EditVlog'
import VlogDetail from '../pages/VlogDetail'
import Dashboard from '../pages/Dashboard'
import { AuthProvider } from '../contexts/AuthContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ToastProvider } from '../contexts/ToastContext'
import { vlogAPI } from '../services/api'

// Mock the API
vi.mock('../services/api', () => ({
  vlogAPI: {
    getVlog: vi.fn(),
    updateVlog: vi.fn(),
    deleteVlog: vi.fn(),
    likeVlog: vi.fn(),
    dislikeVlog: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    shareVlog: vi.fn()
  },
  userAPI: {
    addBookmark: vi.fn(),
    removeBookmark: vi.fn(),
    getBookmarks: vi.fn()
  },
  authAPI: {
    setAuthHeader: vi.fn()
  }
}))

// Mock toast notifications
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn()
  }
}))

// Mock components that might cause issues
vi.mock('../components/UI/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>
}))

vi.mock('../components/UI/BackgroundAnimation', () => ({
  default: () => <div data-testid="background-animation"></div>
}))

/**
 * Integration Tests for Edit & Delete Vlog Feature (Frontend)
 * 
 * Tests complete UI flows including:
 * - Edit flow with form validation and submission
 * - Delete flow with confirmation modal
 * - Authorization checks and button visibility
 * - Optimistic updates and rollbacks
 * - Error handling and recovery
 */

describe('Edit & Delete Vlog Integration Tests (Frontend)', () => {
  let queryClient
  let user

  const mockVlog = {
    _id: 'vlog123',
    title: 'Test Vlog Title',
    description: 'This is a test vlog description that is long enough',
    category: 'technology',
    tags: ['test', 'vlog'],
    images: [
      {
        url: 'https://example.com/image1.jpg',
        publicId: 'image1',
        caption: 'Image 1',
        order: 0
      },
      {
        url: 'https://example.com/image2.jpg',
        publicId: 'image2',
        caption: 'Image 2',
        order: 1
      }
    ],
    author: {
      _id: 'user123',
      username: 'testauthor',
      avatar: 'https://example.com/avatar.jpg',
      bio: 'Test bio'
    },
    views: 100,
    likes: [],
    dislikes: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const mockAuthUser = {
    _id: 'user123',
    username: 'testauthor',
    email: 'test@example.com',
    token: 'mock-token'
  }

  const mockOtherUser = {
    _id: 'user456',
    username: 'otheruser',
    email: 'other@example.com',
    token: 'other-token'
  }

  const renderWithProviders = (component, { initialRoute = '/', authUser = mockAuthUser } = {}) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    // Mock localStorage for auth
    const mockLocalStorage = {
      getItem: vi.fn((key) => {
        if (key === 'user') return JSON.stringify(authUser)
        if (key === 'token') return authUser?.token
        return null
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage })

    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <MemoryRouter initialEntries={[initialRoute]}>
                {component}
              </MemoryRouter>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient?.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Complete Edit Flow', () => {
    it('should load vlog data and pre-populate form', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalledWith(mockVlog._id)
      })

      // Check form is pre-populated
      await waitFor(() => {
        const titleInput = screen.getByLabelText(/title/i)
        expect(titleInput).toHaveValue(mockVlog.title)
      })

      const descriptionInput = screen.getByLabelText(/description/i)
      expect(descriptionInput).toHaveValue(mockVlog.description)
    })

    it('should validate form inputs before submission', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Clear title (make it invalid)
      const titleInput = screen.getByLabelText(/title/i)
      await user.clear(titleInput)
      await user.type(titleInput, 'AB') // Too short

      // Try to submit
      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/title.*at least 3 characters/i)).toBeInTheDocument()
      })

      // Should not call API
      expect(vlogAPI.updateVlog).not.toHaveBeenCalled()
    })

    it('should successfully update vlog with valid data', async () => {
      const updatedVlog = {
        ...mockVlog,
        title: 'Updated Title',
        description: 'Updated description that is long enough'
      }

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      vlogAPI.updateVlog.mockResolvedValue({
        data: { success: true, data: updatedVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Update title
      const titleInput = screen.getByLabelText(/title/i)
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')

      // Update description
      const descriptionInput = screen.getByLabelText(/description/i)
      await user.clear(descriptionInput)
      await user.type(descriptionInput, 'Updated description that is long enough')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should call API with updated data
      await waitFor(() => {
        expect(vlogAPI.updateVlog).toHaveBeenCalledWith(
          mockVlog._id,
          expect.objectContaining({
            title: 'Updated Title',
            description: 'Updated description that is long enough'
          })
        )
      })

      // Should show success toast
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/updated successfully/i))
    })

    it('should handle update errors and show error message', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      vlogAPI.updateVlog.mockRejectedValue({
        response: {
          data: {
            error: 'Failed to update vlog'
          }
        }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Make a change
      const titleInput = screen.getByLabelText(/title/i)
      await user.clear(titleInput)
      await user.type(titleInput, 'New Title')

      // Submit
      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should show error toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })

    it('should enforce maximum image count', async () => {
      const vlogWithManyImages = {
        ...mockVlog,
        images: Array.from({ length: 10 }, (_, i) => ({
          url: `https://example.com/image${i}.jpg`,
          publicId: `image${i}`,
          caption: `Image ${i}`,
          order: i
        }))
      }

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: vlogWithManyImages }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      // Should show message about max images
      expect(screen.getByText(/10.*images/i)).toBeInTheDocument()
    })
  })

  describe('Complete Delete Flow', () => {
    it('should show delete confirmation modal when delete button clicked', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      user = userEvent.setup()

      // Find and click delete button (might be in a menu)
      const deleteButton = await screen.findByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      // Should show confirmation modal
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
      })
    })

    it('should successfully delete vlog when confirmed', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      vlogAPI.deleteVlog.mockResolvedValue({
        data: { success: true, message: 'Vlog deleted successfully' }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      user = userEvent.setup()

      // Click delete button
      const deleteButton = await screen.findByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /confirm|yes|delete/i })
      await user.click(confirmButton)

      // Should call delete API
      await waitFor(() => {
        expect(vlogAPI.deleteVlog).toHaveBeenCalledWith(mockVlog._id)
      })

      // Should show success toast
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/deleted successfully/i))
    })

    it('should cancel deletion when cancel button clicked', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      user = userEvent.setup()

      // Click delete button
      const deleteButton = await screen.findByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      // Click cancel
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: /cancel|no/i })
      await user.click(cancelButton)

      // Should not call delete API
      expect(vlogAPI.deleteVlog).not.toHaveBeenCalled()

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
      })
    })

    it('should handle delete errors and show error message', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      vlogAPI.deleteVlog.mockRejectedValue({
        response: {
          data: {
            error: 'Failed to delete vlog'
          }
        }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      user = userEvent.setup()

      // Click delete and confirm
      const deleteButton = await screen.findByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /confirm|yes|delete/i })
      await user.click(confirmButton)

      // Should show error toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })
  })

  describe('Authorization and Button Visibility', () => {
    it('should show edit and delete buttons to vlog author', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}`, authUser: mockAuthUser }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      // Should show edit and delete buttons
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
      })
    })

    it('should hide edit and delete buttons from non-author', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}`, authUser: mockOtherUser }
      )

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      // Should NOT show edit and delete buttons
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
      })
    })

    it('should redirect non-author trying to access edit page', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit`, authUser: mockOtherUser }
      )

      // Should redirect or show error
      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled()
      })

      // Check for redirect or error message
      await waitFor(() => {
        const editButton = screen.queryByRole('button', { name: /update|save/i })
        expect(editButton).not.toBeInTheDocument()
      }, { timeout: 3000 })
    })
  })

  describe('Optimistic Updates and Rollbacks', () => {
    it('should show optimistic update immediately on edit', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      // Delay the update response
      vlogAPI.updateVlog.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            data: { success: true, data: { ...mockVlog, title: 'Updated Title' } }
          }), 1000)
        )
      )

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Update and submit
      const titleInput = screen.getByLabelText(/title/i)
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')

      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should show loading state
      await waitFor(() => {
        expect(submitButton).toBeDisabled()
      })
    })

    it('should rollback on update error', async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      vlogAPI.updateVlog.mockRejectedValue({
        response: { data: { error: 'Update failed' } }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Try to update
      const titleInput = screen.getByLabelText(/title/i)
      const originalTitle = titleInput.value
      await user.clear(titleInput)
      await user.type(titleInput, 'Failed Update')

      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should show error
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })

      // Form should still be editable (not redirected)
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })
  })

  describe('Error Scenarios', () => {
    it('should handle network errors gracefully', async () => {
      vlogAPI.getVlog.mockRejectedValue(new Error('Network error'))

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument()
      })
    })

    it('should handle 404 errors for non-existent vlogs', async () => {
      vlogAPI.getVlog.mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Vlog not found' }
        }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/nonexistent/edit` }
      )

      // Should show not found message
      await waitFor(() => {
        expect(screen.getByText(/not found/i)).toBeInTheDocument()
      })
    })

    it('should handle authorization errors (403)', async () => {
      vlogAPI.updateVlog.mockRejectedValue({
        response: {
          status: 403,
          data: { error: 'Not authorized' }
        }
      })

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog }
      })

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditVlog />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` }
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      user = userEvent.setup()

      // Try to submit
      const submitButton = screen.getByRole('button', { name: /update|save/i })
      await user.click(submitButton)

      // Should show authorization error
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not authorized/i))
      })
    })
  })
})
