/**
 * Unified function to update follow state across all cache entries
 * This ensures consistent follow state across all components without stale UI
 * 
 * @param {QueryClient} queryClient - React Query client instance
 * @param {string} userId - ID of user being followed/unfollowed
 * @param {boolean} isFollowing - New follow state (true = follow, false = unfollow)
 * @param {string} currentUserId - ID of current user performing the action
 */
export const updateFollowCache = (queryClient, userId, isFollowing) => {
  try {
    // 1. Update target user's follower count
    queryClient.setQueryData(['user', userId], (old) => {
      if (!old) return old;
      return {
        ...old,
        followerCount: isFollowing
          ? (old.followerCount || 0) + 1
          : Math.max((old.followerCount || 0) - 1, 0)
      };
    });

    // 2. Update current user's following list and count
    queryClient.setQueryData(['currentUser'], (old) => {
      if (!old) return old;
      const newFollowing = isFollowing
        ? [...(old.following || []), userId]
        : (old.following || []).filter(id => id !== userId);

      return {
        ...old,
        following: newFollowing,
        followingCount: newFollowing.length
      };
    });

    // 3. Update all vlog lists (Home, Explore, Trending)
    queryClient.setQueriesData({ queryKey: ['vlogs'] }, (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          data: page.data?.map(vlog =>
            vlog.author?._id === userId
              ? {
                ...vlog,
                author: {
                  ...vlog.author,
                  followerCount: isFollowing
                    ? (vlog.author.followerCount || 0) + 1
                    : Math.max((vlog.author.followerCount || 0) - 1, 0)
                }
              }
              : vlog
          )
        }))
      };
    });

    // 4. Update specific vlog if viewing VlogDetail
    const vlogQueries = queryClient.getQueriesData({ queryKey: ['vlog'] });
    vlogQueries.forEach(([queryKey, vlogData]) => {
      if (vlogData?.author?._id === userId) {
        queryClient.setQueryData(queryKey, {
          ...vlogData,
          author: {
            ...vlogData.author,
            followerCount: isFollowing
              ? (vlogData.author.followerCount || 0) + 1
              : Math.max((vlogData.author.followerCount || 0) - 1, 0)
          }
        });
      }
    });

  } catch (error) {
    console.error('Error updating follow cache:', error);
    // Fallback: invalidate affected queries to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['user', userId] });
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    queryClient.invalidateQueries({ queryKey: ['vlogs'] });
  }
};
