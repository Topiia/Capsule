import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useComments } from '../useComments'
import { vlogAPI } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'

// Mock dependencies
vi.mock('../../services/api', () => ({
  vlogAPI: {
    addComment: vi.fn(),
    deleteComment: vi.fn()
  }
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn()
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/test' }))
}))

describe('useComments', () => {
  let queryClient
  let showToast

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    
    showToast = vi.fn()
    useToast.mockReturnValue({ showToast })
    
    // Mock authenticated user by default
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { 
        _id: 'user123',
        username: 'testuser',
        avatar: 'avatar.jpg'
      }
    })

    // Clear all mocks
    vi.clearAllMocks()
  })

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  it('should provide comment methods', () => {
    const { result } = renderHook(() => useComments(), { wrapper })

    expect(result.current).toHaveProperty('addComment')
    expect(result.current).toHaveProperty('deleteComment')
    expect(result.current).toHaveProperty('isAdding')
    expect(result.current).toHaveProperty('isDeleting')
  })

  it('should show toast when unauthenticated user tries to comment', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      user: null
    })

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', 'Great vlog!')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Please log in to comment', 'info')
    })

    expect(vlogAPI.addComment).not.toHaveBeenCalled()
  })

  it('should call addComment API when authenticated', async () => {
    const mockComment = {
      data: {
        data: {
          _id: 'comment123',
          user: { _id: 'user123', username: 'testuser' },
          text: 'Great vlog!',
          createdAt: new Date().toISOString()
        }
      }
    }
    vlogAPI.addComment.mockResolvedValue(mockComment)

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', 'Great vlog!')

    await waitFor(() => {
      expect(vlogAPI.addComment).toHaveBeenCalledWith('vlog123', 'Great vlog!')
    })
  })

  it('should show success toast on successful comment', async () => {
    const mockComment = {
      data: {
        data: {
          _id: 'comment123',
          text: 'Great vlog!'
        }
      }
    }
    vlogAPI.addComment.mockResolvedValue(mockComment)

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', 'Great vlog!')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Comment added!', 'success')
    })
  })

  it('should show error toast on failed comment', async () => {
    const error = new Error('Network error')
    vlogAPI.addComment.mockRejectedValue(error)

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', 'Great vlog!')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Network error', 'error')
    })
  })

  it('should call deleteComment API when authenticated', async () => {
    vlogAPI.deleteComment.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.deleteComment('vlog123', 'comment123')

    await waitFor(() => {
      expect(vlogAPI.deleteComment).toHaveBeenCalledWith('vlog123', 'comment123')
    })
  })

  it('should show success toast on successful delete', async () => {
    vlogAPI.deleteComment.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.deleteComment('vlog123', 'comment123')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Comment deleted!', 'success')
    })
  })

  it('should reject empty comment text', async () => {
    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', '')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Comment text is required', 'error')
    })

    expect(vlogAPI.addComment).not.toHaveBeenCalled()
  })

  it('should reject comment text exceeding 500 characters', async () => {
    const longText = 'a'.repeat(501)
    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', longText)

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Comment cannot exceed 500 characters', 'error')
    })

    expect(vlogAPI.addComment).not.toHaveBeenCalled()
  })

  it('should trim whitespace from comment text', async () => {
    const mockComment = {
      data: {
        data: {
          _id: 'comment123',
          text: 'Great vlog!'
        }
      }
    }
    vlogAPI.addComment.mockResolvedValue(mockComment)

    const { result } = renderHook(() => useComments(), { wrapper })

    result.current.addComment('vlog123', '  Great vlog!  ')

    await waitFor(() => {
      expect(vlogAPI.addComment).toHaveBeenCalledWith('vlog123', 'Great vlog!')
    })
  })
})
