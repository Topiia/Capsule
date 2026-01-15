import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVlogInteractions } from '../useVlogInteractions'
import { vlogAPI, userAPI } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import * as ReactRouterDom from 'react-router-dom'

// Mock dependencies
vi.mock('../../services/api', () => ({
  vlogAPI: {
    likeVlog: vi.fn(),
    dislikeVlog: vi.fn(),
    shareVlog: vi.fn()
  },
  userAPI: {
    addBookmark: vi.fn(),
    removeBookmark: vi.fn()
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

describe('useVlogInteractions', () => {
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
      user: { _id: 'user123' }
    })

    // Clear all mocks
    vi.clearAllMocks()
  })

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  it('should provide all interaction methods', () => {
    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    expect(result.current).toHaveProperty('toggleLike')
    expect(result.current).toHaveProperty('toggleDislike')
    expect(result.current).toHaveProperty('shareVlog')
    expect(result.current).toHaveProperty('toggleBookmark')
    expect(result.current).toHaveProperty('isLiking')
    expect(result.current).toHaveProperty('isDisliking')
    expect(result.current).toHaveProperty('isSharing')
    expect(result.current).toHaveProperty('isBookmarking')
  })

  it('should show toast when unauthenticated user tries to like', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      user: null
    })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleLike('vlog123')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Please log in to like vlogs', 'info')
    })

    expect(vlogAPI.likeVlog).not.toHaveBeenCalled()
  })

  it('should call likeVlog API when authenticated', async () => {
    vlogAPI.likeVlog.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleLike('vlog123')

    await waitFor(() => {
      expect(vlogAPI.likeVlog).toHaveBeenCalledWith('vlog123')
    })
  })

  it('should show success toast on successful like', async () => {
    vlogAPI.likeVlog.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleLike('vlog123')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Vlog liked!', 'success')
    })
  })

  it('should show error toast on failed like', async () => {
    const error = new Error('Network error')
    vlogAPI.likeVlog.mockRejectedValue(error)

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleLike('vlog123')

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Network error', 'error')
    })
  })

  it('should call dislikeVlog API when authenticated', async () => {
    vlogAPI.dislikeVlog.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleDislike('vlog123')

    await waitFor(() => {
      expect(vlogAPI.dislikeVlog).toHaveBeenCalledWith('vlog123')
    })
  })

  it('should call addBookmark API when bookmarking', async () => {
    userAPI.addBookmark.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleBookmark('vlog123', false)

    await waitFor(() => {
      expect(userAPI.addBookmark).toHaveBeenCalledWith('vlog123')
    })
  })

  it('should call removeBookmark API when unbookmarking', async () => {
    userAPI.removeBookmark.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    result.current.toggleBookmark('vlog123', true)

    await waitFor(() => {
      expect(userAPI.removeBookmark).toHaveBeenCalledWith('vlog123')
    })
  })

  it('should show appropriate toast messages for bookmark actions', async () => {
    userAPI.addBookmark.mockResolvedValue({ data: { success: true } })
    userAPI.removeBookmark.mockResolvedValue({ data: { success: true } })

    const { result } = renderHook(() => useVlogInteractions(), { wrapper })

    // Test bookmark
    result.current.toggleBookmark('vlog123', false)
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Vlog bookmarked!', 'success')
    })

    // Test unbookmark
    result.current.toggleBookmark('vlog123', true)
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Bookmark removed!', 'success')
    })
  })
})
