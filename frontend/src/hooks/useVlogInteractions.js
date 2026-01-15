import { useMutation, useQueryClient } from '@tanstack/react-query'
import { vlogAPI, userAPI } from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Custom hook for vlog interactions (like, dislike, share, bookmark)
 * Implements optimistic updates with rollback on failure
 * 
 * @returns {Object} Interaction handlers and loading states
 */
export const useVlogInteractions = () => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Toggle like on a vlog
   * Implements mutual exclusion with dislike
   */
  const likeMutation = useMutation({
    mutationFn: (vlogId) => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }
      return vlogAPI.likeVlog(vlogId)
    },
    onMutate: async (vlogId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to like vlogs', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        return { skipUpdate: true }
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])
      await queryClient.cancelQueries(['vlogs'])

      // Snapshot previous values
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])
      const previousVlogs = queryClient.getQueryData(['vlogs'])

      // Optimistically update single vlog
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const currentLikes = vlogData.likes || []
        const currentDislikes = vlogData.dislikes || []
        const userId = user?._id

        // Check if already liked
        const isLiked = currentLikes.includes(userId)
        const isDisliked = currentDislikes.includes(userId)

        // Toggle like and remove dislike if present
        const newLikes = isLiked
          ? currentLikes.filter(id => id !== userId)
          : [...currentLikes, userId]

        const newDislikes = isDisliked
          ? currentDislikes.filter(id => id !== userId)
          : currentDislikes

        const updatedVlog = {
          ...vlogData,
          likes: newLikes,
          dislikes: newDislikes
        }

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } }
        } else if (old.data) {
          return { ...old, data: updatedVlog }
        }
        return updatedVlog
      })

      // Optimistically update vlog lists
      queryClient.setQueriesData(['vlogs'], (old) => {
        if (!old) return old

        const updateVlogInList = (vlogs) => {
          return vlogs.map(vlog => {
            if (vlog._id === vlogId) {
              const currentLikes = vlog.likes || []
              const currentDislikes = vlog.dislikes || []
              const userId = user?._id

              const isLiked = currentLikes.includes(userId)
              const isDisliked = currentDislikes.includes(userId)

              const newLikes = isLiked
                ? currentLikes.filter(id => id !== userId)
                : [...currentLikes, userId]

              const newDislikes = isDisliked
                ? currentDislikes.filter(id => id !== userId)
                : currentDislikes

              return { ...vlog, likes: newLikes, dislikes: newDislikes }
            }
            return vlog
          })
        }

        if (old.data?.data && Array.isArray(old.data.data)) {
          return { ...old, data: { ...old.data, data: updateVlogInList(old.data.data) } }
        } else if (Array.isArray(old.data)) {
          return { ...old, data: updateVlogInList(old.data) }
        }
        return old
      })

      return { previousVlog, previousVlogs }
    },
    onSuccess: (response, vlogId, context) => {
      if (context?.skipUpdate) return

      // Update with server response
      if (response?.data) {
        queryClient.setQueryData(['vlog', vlogId], response)
      }

      showToast('Vlog liked!', 'success')
    },
    onError: (error, vlogId, context) => {
      if (context?.skipUpdate || error.message === 'Not authenticated') return

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }
      if (context?.previousVlogs) {
        queryClient.setQueryData(['vlogs'], context.previousVlogs)
      }

      showToast(error.message || 'Failed to like vlog', 'error')
    },
    onSettled: (_data, _error, vlogId, context) => {
      if (context?.skipUpdate) return

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['trending'])
      queryClient.invalidateQueries(['userVlogs'])
    }
  })

  /**
   * Toggle dislike on a vlog
   * Implements mutual exclusion with like
   */
  const dislikeMutation = useMutation({
    mutationFn: (vlogId) => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }
      return vlogAPI.dislikeVlog(vlogId)
    },
    onMutate: async (vlogId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to dislike vlogs', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        return { skipUpdate: true }
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])
      await queryClient.cancelQueries(['vlogs'])

      // Snapshot previous values
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])
      const previousVlogs = queryClient.getQueryData(['vlogs'])

      // Optimistically update single vlog
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const currentLikes = vlogData.likes || []
        const currentDislikes = vlogData.dislikes || []
        const userId = user?._id

        // Check if already disliked
        const isLiked = currentLikes.includes(userId)
        const isDisliked = currentDislikes.includes(userId)

        // Toggle dislike and remove like if present
        const newDislikes = isDisliked
          ? currentDislikes.filter(id => id !== userId)
          : [...currentDislikes, userId]

        const newLikes = isLiked
          ? currentLikes.filter(id => id !== userId)
          : currentLikes

        const updatedVlog = {
          ...vlogData,
          likes: newLikes,
          dislikes: newDislikes
        }

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } }
        } else if (old.data) {
          return { ...old, data: updatedVlog }
        }
        return updatedVlog
      })

      // Optimistically update vlog lists
      queryClient.setQueriesData(['vlogs'], (old) => {
        if (!old) return old

        const updateVlogInList = (vlogs) => {
          return vlogs.map(vlog => {
            if (vlog._id === vlogId) {
              const currentLikes = vlog.likes || []
              const currentDislikes = vlog.dislikes || []
              const userId = user?._id

              const isLiked = currentLikes.includes(userId)
              const isDisliked = currentDislikes.includes(userId)

              const newDislikes = isDisliked
                ? currentDislikes.filter(id => id !== userId)
                : [...currentDislikes, userId]

              const newLikes = isLiked
                ? currentLikes.filter(id => id !== userId)
                : currentLikes

              return { ...vlog, likes: newLikes, dislikes: newDislikes }
            }
            return vlog
          })
        }

        if (old.data?.data && Array.isArray(old.data.data)) {
          return { ...old, data: { ...old.data, data: updateVlogInList(old.data.data) } }
        } else if (Array.isArray(old.data)) {
          return { ...old, data: updateVlogInList(old.data) }
        }
        return old
      })

      return { previousVlog, previousVlogs }
    },
    onSuccess: (response, vlogId, context) => {
      if (context?.skipUpdate) return

      // Update with server response
      if (response?.data) {
        queryClient.setQueryData(['vlog', vlogId], response)
      }

      showToast('Vlog disliked!', 'success')
    },
    onError: (error, vlogId, context) => {
      if (context?.skipUpdate || error.message === 'Not authenticated') return

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }
      if (context?.previousVlogs) {
        queryClient.setQueryData(['vlogs'], context.previousVlogs)
      }

      showToast(error.message || 'Failed to dislike vlog', 'error')
    },
    onSettled: (_data, _error, vlogId, context) => {
      if (context?.skipUpdate) return

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['trending'])
      queryClient.invalidateQueries(['userVlogs'])
    }
  })

  /**
   * Share a vlog
   * Uses native share API if available, otherwise copies to clipboard
   */
  const shareMutation = useMutation({
    mutationFn: async ({ vlogId, vlog }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to share vlogs', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        throw new Error('Not authenticated')
      }

      const shareUrl = `${window.location.origin}/vlog/${vlogId}`

      try {
        // Try native share API first
        if (navigator.share) {
          await navigator.share({
            title: vlog.title,
            text: vlog.description,
            url: shareUrl
          })
        } else {
          // Fallback to clipboard
          await navigator.clipboard.writeText(shareUrl)
          showToast('Link copied to clipboard!', 'success')
        }

        // Increment share count on backend
        return await vlogAPI.shareVlog(vlogId)
      } catch (error) {
        // User cancelled share dialog
        if (error.name === 'AbortError') {
          throw new Error('Share cancelled')
        }
        throw error
      }
    },
    onMutate: async ({ vlogId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])

      // Snapshot previous value
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])

      // Optimistically increment share count
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const updatedVlog = {
          ...vlogData,
          shares: (vlogData.shares || 0) + 1
        }

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } }
        } else if (old.data) {
          return { ...old, data: updatedVlog }
        }
        return updatedVlog
      })

      return { previousVlog }
    },
    onSuccess: (_response, { _vlogId }) => {
      showToast('Vlog shared successfully!', 'success')
    },
    onError: (error, { vlogId }, context) => {
      // Don't show error for cancelled shares
      if (error.message === 'Share cancelled' || error.message === 'Not authenticated') {
        // Rollback share count
        if (context?.previousVlog) {
          queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
        }
        return
      }

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }

      showToast(error.message || 'Failed to share vlog', 'error')
    },
    onSettled: (_data, error, { vlogId }) => {
      // Skip refetch if share was cancelled or not authenticated
      if (error?.message === 'Share cancelled' || error?.message === 'Not authenticated') {
        return
      }

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['trending'])
      queryClient.invalidateQueries(['userVlogs'])
    }
  })

  /**
   * Toggle bookmark on a vlog
   */
  const bookmarkMutation = useMutation({
    mutationFn: async ({ vlogId, isBookmarked }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to bookmark vlogs', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        throw new Error('Not authenticated')
      }

      if (isBookmarked) {
        return await userAPI.removeBookmark(vlogId)
      } else {
        return await userAPI.addBookmark(vlogId)
      }
    },
    onMutate: async ({ vlogId, isBookmarked }) => {
      if (!isAuthenticated) {
        return { skipUpdate: true }
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])
      await queryClient.cancelQueries(['bookmarks'])

      // Snapshot previous values
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])

      // Cancel all bookmark queries
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] })

      // Optimistically update bookmark state in vlog
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const updatedVlog = {
          ...vlogData,
          isBookmarked: !isBookmarked
        }

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } }
        } else if (old.data) {
          return { ...old, data: updatedVlog }
        }
        return updatedVlog
      })

      // Optimistically update all bookmarks queries
      queryClient.setQueriesData({ queryKey: ['bookmarks'] }, (old) => {
        if (!old) return old

        const bookmarks = old.data || []

        let updatedBookmarks
        if (isBookmarked) {
          // Remove from bookmarks
          updatedBookmarks = bookmarks.filter(b => b._id !== vlogId)
        } else {
          // We don't add to bookmarks optimistically since we don't have full vlog data
          updatedBookmarks = bookmarks
        }

        // Update total count
        const newTotal = isBookmarked ? (old.total || 0) - 1 : (old.total || 0)

        return {
          ...old,
          data: updatedBookmarks,
          total: newTotal
        }
      })

      return { previousVlog }
    },
    onSuccess: (_response, { _vlogId, isBookmarked }) => {
      const message = isBookmarked ? 'Bookmark removed!' : 'Vlog bookmarked!'
      showToast(message, 'success')
    },
    onError: (error, { vlogId }, context) => {
      if (error.message === 'Not authenticated') {
        return
      }

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }

      showToast(error.message || 'Failed to update bookmark', 'error')
    },
    onSettled: (_data, error, { vlogId }) => {
      if (error?.message === 'Not authenticated') {
        return
      }

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      queryClient.invalidateQueries(['user', 'me'])
    }
  })

  return {
    // Like/Dislike
    toggleLike: (vlogId) => likeMutation.mutate(vlogId),
    toggleDislike: (vlogId) => dislikeMutation.mutate(vlogId),
    isLiking: likeMutation.isPending,
    isDisliking: dislikeMutation.isPending,

    // Share
    shareVlog: (vlogId, vlog) => shareMutation.mutate({ vlogId, vlog }),
    isSharing: shareMutation.isPending,

    // Bookmark
    toggleBookmark: (vlogId, isBookmarked) => bookmarkMutation.mutate({ vlogId, isBookmarked }),
    isBookmarking: bookmarkMutation.isPending
  }
}
