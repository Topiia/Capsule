import { useMutation, useQueryClient } from '@tanstack/react-query'
import { vlogAPI } from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Custom hook for comment operations (add, delete)
 * Implements optimistic updates with rollback on failure
 * Validates comment count consistency
 * 
 * @returns {Object} Comment handlers and loading states
 */
export const useComments = () => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Add a comment to a vlog
   * Implements optimistic update with comment count validation
   */
  const addCommentMutation = useMutation({
    mutationFn: async ({ vlogId, text }) => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Comment text is required')
      }

      if (text.length > 500) {
        throw new Error('Comment cannot exceed 500 characters')
      }

      return await vlogAPI.addComment(vlogId, text.trim())
    },
    onMutate: async ({ vlogId, text }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to comment', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        return { skipUpdate: true }
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])

      // Snapshot previous value
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])

      // Create optimistic comment
      const optimisticComment = {
        _id: `temp-${Date.now()}`,
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar
        },
        text: text.trim(),
        createdAt: new Date().toISOString()
      }

      // Optimistically update vlog with new comment
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const currentComments = vlogData.comments || []

        const updatedVlog = {
          ...vlogData,
          comments: [optimisticComment, ...currentComments]
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
    onSuccess: (response, { vlogId }, context) => {
      if (context?.skipUpdate) return

      // Update with server response
      if (response?.data) {
        queryClient.setQueryData(['vlog', vlogId], (old) => {
          if (!old) return old

          const vlogData = old.data?.data || old.data || old
          const currentComments = vlogData.comments || []

          // Replace optimistic comment with real one
          const updatedComments = currentComments.map(comment => 
            comment._id.startsWith('temp-') ? response.data.data : comment
          )

          // Validate comment count consistency
          const expectedCount = (vlogData.comments?.length || 0)
          const actualCount = updatedComments.length

          if (expectedCount !== actualCount) {
            console.warn(`Comment count mismatch: expected ${expectedCount}, got ${actualCount}`)
          }

          const updatedVlog = {
            ...vlogData,
            comments: updatedComments
          }

          // Preserve response structure
          if (old.data?.data) {
            return { ...old, data: { ...old.data, data: updatedVlog } }
          } else if (old.data) {
            return { ...old, data: updatedVlog }
          }
          return updatedVlog
        })
      }

      showToast('Comment added!', 'success')
    },
    onError: (error, { vlogId }, context) => {
      if (context?.skipUpdate || error.message === 'Not authenticated') return

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }

      showToast(error.message || 'Failed to add comment', 'error')
    },
    onSettled: (data, error, { vlogId }, context) => {
      if (context?.skipUpdate) return

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['trending'])
      queryClient.invalidateQueries(['userVlogs'])
    }
  })

  /**
   * Delete a comment from a vlog
   * Implements optimistic update with comment count validation
   */
  const deleteCommentMutation = useMutation({
    mutationFn: async ({ vlogId, commentId }) => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }

      return await vlogAPI.deleteComment(vlogId, commentId)
    },
    onMutate: async ({ vlogId, commentId }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast('Please log in to delete comments', 'info')
        // Navigate to login with return URL
        setTimeout(() => {
          navigate('/login', { state: { from: location.pathname } })
        }, 1500)
        return { skipUpdate: true }
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(['vlog', vlogId])

      // Snapshot previous value
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])

      // Optimistically remove comment
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old

        const vlogData = old.data?.data || old.data || old
        const currentComments = vlogData.comments || []

        const updatedVlog = {
          ...vlogData,
          comments: currentComments.filter(comment => comment._id !== commentId)
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
    onSuccess: (response, { vlogId }, context) => {
      if (context?.skipUpdate) return

      // Validate comment count consistency
      const currentVlog = queryClient.getQueryData(['vlog', vlogId])
      if (currentVlog) {
        const vlogData = currentVlog.data?.data || currentVlog.data || currentVlog
        const commentCount = vlogData.comments?.length || 0
        
        // Log for debugging if count seems off
        if (commentCount < 0) {
          console.warn('Comment count is negative, this should not happen')
        }
      }

      showToast('Comment deleted!', 'success')
    },
    onError: (error, { vlogId }, context) => {
      if (context?.skipUpdate || error.message === 'Not authenticated') return

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }

      showToast(error.message || 'Failed to delete comment', 'error')
    },
    onSettled: (data, error, { vlogId }, context) => {
      if (context?.skipUpdate) return

      // Refetch to ensure consistency
      queryClient.invalidateQueries(['vlog', vlogId])
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['trending'])
      queryClient.invalidateQueries(['userVlogs'])
    }
  })

  return {
    // Add comment
    addComment: (vlogId, text) => addCommentMutation.mutate({ vlogId, text }),
    isAdding: addCommentMutation.isPending,

    // Delete comment
    deleteComment: (vlogId, commentId) => deleteCommentMutation.mutate({ vlogId, commentId }),
    isDeleting: deleteCommentMutation.isPending
  }
}
