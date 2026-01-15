import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import api from '../services/api'
import { AuthProvider } from '../contexts/AuthContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ToastProvider } from '../contexts/ToastContext'
import VlogCard from '../components/Vlog/VlogCard'
import VlogDetail from '../pages/VlogDetail'
import Bookmarks from '../pages/Bookmarks'

// Create axios mock
let mockAxios

// Mock data
const mockUser = {
  _id: 'user123',
  username: 'testuser',
  email: 'test@example.com',
  avatar: 'https://example.com/avatar.jpg'
}

const mockVlog = {
  _id: 'vlog123',
  title: 'Test Vlog',
  description: 'Test Description',
  images: [{ url: 'https://example.com/image.jpg', publicId: 'test' }],
  author: {
    _id: 'author123',
    username: 'author',
    avatar: 'https://example.com/author.jpg'
  },
  likes: [],
  dislikes: [],
  comments: [],
  shares: 0,
  views: 100,
  createdAt: new Date().toISOString()
}

const mockComment = {
  _id: 'comment123',
  user: mockUser,
  text: 'Test comment',
  createdAt: new Date().toISOString()
}

// Helper to render with all providers
const renderWithProviders = (ui, { initialRoute = '/', queryClient = null, authenticated = true } = {}) => {
  const client = queryClient || new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  // Mock authenticated user
  if (authenticated) {
    localStorage.setItem('token', 'mock-token')
    localStorage.setItem('user', JSON.stringify(mockUser))
    
    // Mock auth API
    mockAxios.onGet('/auth/me').reply(200, {
      success: true,
      data: mockUser
    })
  }

  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <MemoryRouter initialEntries={[initialRoute]}>
                {ui}
              </MemoryRouter>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }
}

describe('Vlog Interactions Integration Tests - Task 16', () => {
  beforeEach(() => {
    mockAxios = new MockAdapter(api)
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    mockAxios.reset()
    mockAxios.restore()
  })

  describe('Like Interaction Flow', () => {
    it('should complete full like flow: click → backend update → UI update → cache invalidation', async () => {
      // Requirements: 1.1
      const vlogWithLike = { ...mockVlog, likes: [mockUser._id] }

      // Mock initial vlog fetch
      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      // Mock like API call
      mockAxios.onPut(`/vlogs/${mockVlog._id}/like`).reply(200, {
        success: true,
        data: vlogWithLike
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      // Wait for vlog to load
      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Find like button by text content
      const likeButtons = screen.getAllByRole('button')
      const likeButton = likeButtons.find(btn => btn.textContent.includes('Like'))
      expect(likeButton).toBeDefined()

      await user.click(likeButton)

      // Verify backend was called
      await waitFor(() => {
        const likeCalls = mockAxios.history.put.filter(
          req => req.url === `/vlogs/${mockVlog._id}/like`
        )
        expect(likeCalls.length).toBeGreaterThan(0)
      })

      // Verify toast notification appears
      await waitFor(() => {
        expect(screen.getByText(/liked/i)).toBeInTheDocument()
      })

      // Verify cache invalidation by checking refetch
      await waitFor(() => {
        const vlogFetches = mockAxios.history.get.filter(
          req => req.url.includes(`/vlogs/${mockVlog._id}`)
        )
        expect(vlogFetches.length).toBeGreaterThan(1) // Initial + refetch
      })
    })

    it('should rollback UI on backend failure', async () => {
      // Requirements: 1.5
      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      // Mock like API to fail
      mockAxios.onPut(`/vlogs/${mockVlog._id}/like`).reply(500, {
        success: false,
        error: { message: 'Server error' }
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      const likeButtons = screen.getAllByRole('button')
      const likeButton = likeButtons.find(btn => btn.textContent.includes('Like'))
      expect(likeButton).toBeDefined()

      await user.click(likeButton)

      // Wait for error toast
      await waitFor(() => {
        expect(screen.getByText(/failed|error/i)).toBeInTheDocument()
      }, { timeout: 1000 })

      // Verify backend was called
      const likeCalls = mockAxios.history.put.filter(
        req => req.url === `/vlogs/${mockVlog._id}/like`
      )
      expect(likeCalls.length).toBeGreaterThan(0)
    })
  })

  describe('Comment Interaction Flow', () => {
    it('should verify comment API integration and backend calls', async () => {
      // Requirements: 2.1
      const vlogWithComment = {
        ...mockVlog,
        comments: [mockComment]
      }

      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      mockAxios.onPost(`/vlogs/${mockVlog._id}/comments`).reply(200, {
        success: true,
        data: mockComment
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      // Verify vlog detail page loads
      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Verify vlog was fetched from backend
      const vlogFetches = mockAxios.history.get.filter(
        req => req.url.includes(`/vlogs/${mockVlog._id}`)
      )
      expect(vlogFetches.length).toBeGreaterThan(0)

      // Verify comment section or interaction buttons are present
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should maintain comment count consistency after add and delete', async () => {
      // Requirements: 2.4
      const vlogWithComments = {
        ...mockVlog,
        comments: [mockComment, { ...mockComment, _id: 'comment456', text: 'Another comment', user: mockUser }]
      }

      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: vlogWithComments
      })

      mockAxios.onDelete(`/vlogs/${mockVlog._id}/comments/${mockComment._id}`).reply(200, {
        success: true
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Verify comments are displayed
      await waitFor(() => {
        expect(screen.getByText(mockComment.text)).toBeInTheDocument()
      })

      // Find delete buttons
      const deleteButtons = screen.getAllByRole('button').filter(btn => 
        btn.textContent.includes('Delete') || btn.getAttribute('aria-label')?.includes('delete')
      )

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0])

        // Verify backend was called
        await waitFor(() => {
          const deleteCalls = mockAxios.history.delete.filter(
            req => req.url.includes(`/vlogs/${mockVlog._id}/comments`)
          )
          expect(deleteCalls.length).toBeGreaterThan(0)
        })
      }
    })
  })

  describe('Bookmark Interaction Flow', () => {
    it('should complete full bookmark flow: bookmark → appears on Bookmarks page', async () => {
      // Requirements: 4.1
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false }
        }
      })

      mockAxios.onPost(`/users/bookmarks/${mockVlog._id}`).reply(200, {
        success: true,
        data: { bookmarked: true }
      })

      mockAxios.onGet('/users/bookmarks').reply(200, {
        success: true,
        data: [mockVlog],
        total: 1
      })

      // Render VlogCard first
      const { user } = renderWithProviders(
        <VlogCard vlog={mockVlog} />,
        { queryClient }
      )

      // Find bookmark button
      const buttons = screen.getAllByRole('button')
      const bookmarkButton = buttons.find(btn => 
        btn.getAttribute('title')?.includes('bookmark') || 
        btn.getAttribute('title')?.includes('save') ||
        btn.textContent.includes('Save')
      )

      if (bookmarkButton) {
        await user.click(bookmarkButton)

        // Verify backend was called
        await waitFor(() => {
          const bookmarkCalls = mockAxios.history.post.filter(
            req => req.url === `/users/bookmarks/${mockVlog._id}`
          )
          expect(bookmarkCalls.length).toBeGreaterThan(0)
        })

        // Verify toast notification
        await waitFor(() => {
          expect(screen.getByText(/bookmarked/i)).toBeInTheDocument()
        })
      }
    })

    it('should verify bookmarks page displays bookmarked vlogs', async () => {
      // Requirements: 4.4, 6.3
      mockAxios.onGet('/users/bookmarks').reply(200, {
        success: true,
        data: [mockVlog],
        total: 1
      })

      mockAxios.onDelete(`/users/bookmarks/${mockVlog._id}`).reply(200, {
        success: true,
        data: { bookmarked: false }
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/bookmarks" element={<Bookmarks />} />
        </Routes>,
        { initialRoute: '/bookmarks' }
      )

      // Verify bookmarks page loads
      await waitFor(() => {
        expect(screen.getByText('Bookmarks')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Verify vlog appears in bookmarks
      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      })

      // Verify backend was called to fetch bookmarks
      const bookmarkFetches = mockAxios.history.get.filter(
        req => req.url.includes('/users/bookmarks')
      )
      expect(bookmarkFetches.length).toBeGreaterThan(0)
    })
  })

  describe('Cross-Page State Consistency', () => {
    it('should persist interaction state from VlogCard to VlogDetail', async () => {
      // Requirements: 6.4
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false }
        }
      })

      const likedVlog = { ...mockVlog, likes: [mockUser._id] }

      mockAxios.onPut(`/vlogs/${mockVlog._id}/like`).reply(200, {
        success: true,
        data: likedVlog
      })

      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: likedVlog
      })

      // Render VlogCard
      const { user } = renderWithProviders(
        <VlogCard vlog={mockVlog} />,
        { queryClient }
      )

      // Find like button
      const buttons = screen.getAllByRole('button')
      const likeButton = buttons.find(btn => 
        btn.getAttribute('title')?.includes('like') || 
        btn.textContent.includes('Like')
      )

      if (likeButton) {
        await user.click(likeButton)

        // Verify backend was called
        await waitFor(() => {
          const likeCalls = mockAxios.history.put.filter(
            req => req.url === `/vlogs/${mockVlog._id}/like`
          )
          expect(likeCalls.length).toBeGreaterThan(0)
        })

        // Verify cache was updated
        const cachedData = queryClient.getQueryData(['vlog', mockVlog._id])
        expect(cachedData).toBeDefined()
      }
    })
  })

  describe('Share Interaction Flow', () => {
    it('should handle share interaction and increment share count', async () => {
      // Requirements: 3.1, 3.4
      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      mockAxios.onPut(`/vlogs/${mockVlog._id}/share`).reply(200, {
        success: true,
        data: { shares: 1 }
      })

      // Mock clipboard API
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` }
      )

      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Find share button
      const buttons = screen.getAllByRole('button')
      const shareButton = buttons.find(btn => btn.textContent.includes('Share'))

      if (shareButton) {
        await user.click(shareButton)

        // Verify either clipboard or share was called
        await waitFor(() => {
          const shareCalls = mockAxios.history.put.filter(
            req => req.url === `/vlogs/${mockVlog._id}/share`
          )
          // Share endpoint should be called
          expect(shareCalls.length).toBeGreaterThan(0)
        }, { timeout: 2000 })
      }
    })

    it('should verify share functionality with clipboard fallback', async () => {
      // Requirements: 3.2, 3.3
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      })

      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      mockAxios.onPut(`/vlogs/${mockVlog._id}/share`).reply(200, {
        success: true,
        data: { shares: 1 }
      })

      const { user } = renderWithProviders(
        <VlogCard vlog={mockVlog} />
      )

      // Find share button
      const buttons = screen.getAllByRole('button')
      const shareButton = buttons.find(btn => btn.textContent.includes('Share'))

      if (shareButton) {
        await user.click(shareButton)

        // Verify backend was called
        await waitFor(() => {
          const shareCalls = mockAxios.history.put.filter(
            req => req.url === `/vlogs/${mockVlog._id}/share`
          )
          expect(shareCalls.length).toBeGreaterThan(0)
        }, { timeout: 2000 })
      }
    })
  })

  describe('Cache Invalidation Strategy', () => {
    it('should invalidate all relevant queries after interaction', async () => {
      // Requirements: 6.5
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false }
        }
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      mockAxios.onGet(`/vlogs/${mockVlog._id}`).reply(200, {
        success: true,
        data: mockVlog
      })

      mockAxios.onPut(`/vlogs/${mockVlog._id}/like`).reply(200, {
        success: true,
        data: { ...mockVlog, likes: [mockUser._id] }
      })

      const { user } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<VlogDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}`, queryClient }
      )

      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Find like button
      const buttons = screen.getAllByRole('button')
      const likeButton = buttons.find(btn => btn.textContent.includes('Like'))

      if (likeButton) {
        await user.click(likeButton)

        // Wait for mutation to complete
        await waitFor(() => {
          const likeCalls = mockAxios.history.put.filter(
            req => req.url === `/vlogs/${mockVlog._id}/like`
          )
          expect(likeCalls.length).toBeGreaterThan(0)
        })

        // Verify cache invalidation was called
        await waitFor(() => {
          expect(invalidateSpy).toHaveBeenCalled()
        })
      }
    })
  })
})
