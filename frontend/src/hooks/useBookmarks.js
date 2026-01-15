import { useQuery } from '@tanstack/react-query'
import { userAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

/**
 * Custom hook for fetching user's bookmarked vlogs
 * Implements pagination and proper loading/error states
 * 
 * @param {Object} options - Query options
 * @param {number} options.page - Current page number (default: 1)
 * @param {number} options.limit - Items per page (default: 20)
 * @returns {Object} Bookmarks data, loading state, error, and refetch function
 */
export const useBookmarks = ({ page = 1, limit = 20 } = {}) => {
  const { isAuthenticated } = useAuth()

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['bookmarks', { page, limit }],
    queryFn: async () => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }

      const response = await userAPI.getBookmarks({ page, limit })
      return response.data
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  })

  // Extract bookmarks from response
  const bookmarks = data?.data || []
  const pagination = {
    page: data?.currentPage || 1,
    limit: limit,
    total: data?.total || 0,
    pages: data?.totalPages || 0
  }

  return {
    bookmarks,
    pagination,
    isLoading,
    isFetching,
    error,
    refetch,
    hasNextPage: data?.hasNextPage || false,
    hasPreviousPage: data?.hasPrevPage || false
  }
}
