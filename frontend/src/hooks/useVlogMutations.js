import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { vlogAPI } from '../services/api'

/**
 * Hook for updating a vlog with optimistic updates
 * @param {string} vlogId - The ID of the vlog to update
 * @returns {Object} Mutation object from React Query
 */
export const useUpdateVlog = (vlogId) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (vlogData) => vlogAPI.updateVlog(vlogId, vlogData),
    onMutate: async (newVlogData) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries(['vlog', vlogId])
      
      // Snapshot the previous value
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])
      
      // Optimistically update to the new value
      queryClient.setQueryData(['vlog', vlogId], (old) => {
        if (!old) return old
        return {
          ...old,
          data: {
            ...old.data,
            data: {
              ...old.data.data,
              ...newVlogData,
              updatedAt: new Date().toISOString()
            }
          }
        }
      })
      
      // Return a context object with the snapshotted value
      return { previousVlog }
    },
    onSuccess: (response) => {
      // Update with actual server response
      queryClient.setQueryData(['vlog', vlogId], response)
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['userVlogs'])
      toast.success('Vlog updated successfully!')
      navigate(`/vlog/${vlogId}`)
    },
    onError: (error, newVlogData, context) => {
      // Rollback to the previous value on error
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }
      toast.error(error.response?.data?.error || error.message || 'Failed to update vlog')
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries(['vlog', vlogId])
    }
  })
}

/**
 * Hook for deleting a vlog with optimistic removal
 * @param {string} vlogId - The ID of the vlog to delete
 * @returns {Object} Mutation object from React Query
 */
export const useDeleteVlog = (vlogId) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => vlogAPI.deleteVlog(vlogId),
    onMutate: async () => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries(['vlogs'])
      await queryClient.cancelQueries(['userVlogs'])
      await queryClient.cancelQueries(['vlog', vlogId])

      // Snapshot the previous values for rollback
      const previousVlogs = queryClient.getQueryData(['vlogs'])
      const previousUserVlogs = queryClient.getQueryData(['userVlogs'])
      const previousVlog = queryClient.getQueryData(['vlog', vlogId])

      // Optimistically remove the vlog from all lists
      queryClient.setQueriesData(['vlogs'], (old) => {
        if (!old) return old
        
        // Handle different response structures
        if (old.data?.data && Array.isArray(old.data.data)) {
          return {
            ...old,
            data: {
              ...old.data,
              data: old.data.data.filter(v => v._id !== vlogId)
            }
          }
        }
        
        // Handle direct array structure
        if (Array.isArray(old.data)) {
          return {
            ...old,
            data: old.data.filter(v => v._id !== vlogId)
          }
        }
        
        return old
      })

      queryClient.setQueriesData(['userVlogs'], (old) => {
        if (!old) return old
        
        // Handle different response structures
        if (old.data?.data && Array.isArray(old.data.data)) {
          return {
            ...old,
            data: {
              ...old.data,
              data: old.data.data.filter(v => v._id !== vlogId)
            }
          }
        }
        
        // Handle direct array structure
        if (Array.isArray(old.data)) {
          return {
            ...old,
            data: old.data.filter(v => v._id !== vlogId)
          }
        }
        
        return old
      })

      // Return context with previous values for rollback
      return { previousVlogs, previousUserVlogs, previousVlog }
    },
    onSuccess: () => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries(['vlogs'])
      queryClient.invalidateQueries(['userVlogs'])
      queryClient.removeQueries(['vlog', vlogId])
      
      toast.success('Vlog deleted successfully!')
      navigate('/dashboard')
    },
    onError: (error, variables, context) => {
      // Rollback optimistic updates on error
      if (context?.previousVlogs) {
        queryClient.setQueryData(['vlogs'], context.previousVlogs)
      }
      if (context?.previousUserVlogs) {
        queryClient.setQueryData(['userVlogs'], context.previousUserVlogs)
      }
      if (context?.previousVlog) {
        queryClient.setQueryData(['vlog', vlogId], context.previousVlog)
      }
      
      toast.error(error.response?.data?.error || error.message || 'Failed to delete vlog')
    }
  })
}
