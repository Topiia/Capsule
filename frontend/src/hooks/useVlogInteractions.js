import { useMutation, useQueryClient } from "@tanstack/react-query";
import { vlogAPI, userAPI } from "../services/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Custom hook for vlog interactions (like, dislike, share, bookmark)
 * Implements optimistic updates with rollback on failure
 *
 * @returns {Object} Interaction handlers and loading states
 */
export const useVlogInteractions = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Toggle like on a vlog
   * Implements mutual exclusion with dislike
   */
  const likeMutation = useMutation({
    mutationFn: (vlogId) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }
      return vlogAPI.likeVlog(vlogId);
    },
    onMutate: async (vlogId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to like vlogs", "info");
        // Navigate to login with return URL
        setTimeout(() => {
          navigate("/login", { state: { from: location.pathname } });
        }, 1500);
        return { skipUpdate: true };
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["vlog", vlogId] });
      await queryClient.cancelQueries({ queryKey: ["vlogs"] });
      await queryClient.cancelQueries({ queryKey: ["exploreVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["featuredVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["latestVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["trendingVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["userVlogs"] });

      // Snapshot previous values (minimal for single vlog correctness)
      const previousVlog = queryClient.getQueryData(["vlog", vlogId]);

      // Helper for updating vlog state
      const getUpdatedVlog = (vlog) => {
        const wasLiked = !!vlog.isLiked;
        // If it was already liked, we are toggling it OFF
        if (wasLiked) {
          return {
            ...vlog,
            isLiked: false,
            likeCount: Math.max(0, (vlog.likeCount || 0) - 1),
          };
        }

        // If it wasn't liked, we are toggling it ON
        // This also means we must turn OFF dislike if it exists
        return {
          ...vlog,
          isLiked: true,
          likeCount: (vlog.likeCount || 0) + 1,
          isDisliked: false, // Mutual exclusion
          dislikeCount: vlog.isDisliked
            ? Math.max(0, (vlog.dislikeCount || 0) - 1)
            : vlog.dislikeCount || 0,
        };
      };

      const updateVlogList = (list) => {
        return list.map((v) => (v._id === vlogId ? getUpdatedVlog(v) : v));
      };

      // Optimistically update single vlog
      queryClient.setQueryData(["vlog", vlogId], (old) => {
        if (!old) return old;
        const vlogData = old.data?.data || old.data || old;
        const updatedVlog = getUpdatedVlog(vlogData);

        if (old.data?.data)
          return { ...old, data: { ...old.data, data: updatedVlog } };
        if (old.data) return { ...old, data: updatedVlog };
        return updatedVlog;
      });

      // Optimistically update standard lists
      [
        ["vlogs"],
        ["featuredVlogs"],
        ["latestVlogs"],
        ["trendingVlogs"],
        ["userVlogs"],
      ].forEach((key) => {
        queryClient.setQueriesData({ queryKey: key }, (old) => {
          if (!old) return old;
          if (old.data?.data && Array.isArray(old.data.data)) {
            return {
              ...old,
              data: { ...old.data, data: updateVlogList(old.data.data) },
            };
          }
          if (Array.isArray(old)) return updateVlogList(old);
          return old;
        });
      });

      // Optimistically update Infinite Queries (Explore)
      queryClient.setQueriesData({ queryKey: ["exploreVlogs"] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => {
            if (page.data?.data && Array.isArray(page.data.data)) {
              return {
                ...page,
                data: { ...page.data, data: updateVlogList(page.data.data) },
              };
            }
            return page;
          }),
        };
      });

      return { previousVlog, wasLiked: !!previousVlog?.isLiked };
    },
    onSuccess: (response, vlogId, context) => {
      if (context?.skipUpdate) return;

      // Update with server response (Merge)
      if (response?.data?.data) {
        const serverData = response.data.data;
        queryClient.setQueryData(["vlog", vlogId], (old) => {
          if (!old) return old;
          const vlogData = old.data?.data || old.data || old;
          const mergedVlog = { ...vlogData, ...serverData };

          if (old.data?.data)
            return { ...old, data: { ...old.data, data: mergedVlog } };
          if (old.data) return { ...old, data: mergedVlog };
          return mergedVlog;
        });
      }

      // Dynamic toast based on server response (Truthful)
      const isLiked = response?.data?.data?.isLiked;
      const message = isLiked ? "Capsule liked!" : "Capsule like removed";
      showToast(message, "success");
    },
    onError: (error, vlogId, context) => {
      if (context?.skipUpdate || error.message === "Not authenticated") return;

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
      }

      showToast(error.message || "Failed to update like", "error");
    },
    onSettled: (_data, _error, vlogId, context) => {
      if (context?.skipUpdate) return;

      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["vlog", vlogId] });
      queryClient.invalidateQueries({ queryKey: ["vlogs"] });
      queryClient.invalidateQueries({ queryKey: ["exploreVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["featuredVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["latestVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["trendingVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["userVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["likedVlogs"] });
    },
  });

  /**
   * Toggle dislike on a vlog
   * Implements mutual exclusion with like
   */
  const dislikeMutation = useMutation({
    mutationFn: (vlogId) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }
      return vlogAPI.dislikeVlog(vlogId);
    },
    onMutate: async (vlogId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to dislike vlogs", "info");
        // Navigate to login with return URL
        setTimeout(() => {
          navigate("/login", { state: { from: location.pathname } });
        }, 1500);
        return { skipUpdate: true };
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["vlog", vlogId] });
      await queryClient.cancelQueries({ queryKey: ["vlogs"] });
      await queryClient.cancelQueries({ queryKey: ["exploreVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["featuredVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["latestVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["trendingVlogs"] });
      await queryClient.cancelQueries({ queryKey: ["userVlogs"] });

      // Snapshot previous values
      const previousVlog = queryClient.getQueryData(["vlog", vlogId]);

      // Helper for updating vlog state
      const getUpdatedVlog = (vlog) => {
        const wasDisliked = !!vlog.isDisliked;
        // If it was already disliked, we are toggling it OFF
        if (wasDisliked) {
          return {
            ...vlog,
            isDisliked: false,
            dislikeCount: Math.max(0, (vlog.dislikeCount || 0) - 1),
          };
        }

        // If it wasn't disliked, we are toggling it ON
        // This also means we must turn OFF like if it exists
        return {
          ...vlog,
          isDisliked: true,
          dislikeCount: (vlog.dislikeCount || 0) + 1,
          isLiked: false, // Mutual exclusion
          likeCount: vlog.isLiked
            ? Math.max(0, (vlog.likeCount || 0) - 1)
            : vlog.likeCount || 0,
        };
      };

      const updateVlogList = (list) => {
        return list.map((v) => (v._id === vlogId ? getUpdatedVlog(v) : v));
      };

      // Optimistically update single vlog
      queryClient.setQueryData(["vlog", vlogId], (old) => {
        if (!old) return old;
        const vlogData = old.data?.data || old.data || old;
        const updatedVlog = getUpdatedVlog(vlogData);

        if (old.data?.data)
          return { ...old, data: { ...old.data, data: updatedVlog } };
        if (old.data) return { ...old, data: updatedVlog };
        return updatedVlog;
      });

      // Optimistically update standard lists
      [
        ["vlogs"],
        ["featuredVlogs"],
        ["latestVlogs"],
        ["trendingVlogs"],
        ["userVlogs"],
      ].forEach((key) => {
        queryClient.setQueriesData({ queryKey: key }, (old) => {
          if (!old) return old;
          if (old.data?.data && Array.isArray(old.data.data)) {
            return {
              ...old,
              data: { ...old.data, data: updateVlogList(old.data.data) },
            };
          }
          if (Array.isArray(old)) return updateVlogList(old);
          return old;
        });
      });

      // Optimistically update Infinite Queries (Explore)
      queryClient.setQueriesData({ queryKey: ["exploreVlogs"] }, (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => {
            if (page.data?.data && Array.isArray(page.data.data)) {
              return {
                ...page,
                data: { ...page.data, data: updateVlogList(page.data.data) },
              };
            }
            return page;
          }),
        };
      });

      return { previousVlog, wasDisliked: !!previousVlog?.isDisliked };
    },
    onSuccess: (response, vlogId, context) => {
      if (context?.skipUpdate) return;

      // Update with server response (Merge)
      if (response?.data?.data) {
        const serverData = response.data.data;
        queryClient.setQueryData(["vlog", vlogId], (old) => {
          if (!old) return old;
          const vlogData = old.data?.data || old.data || old;
          const mergedVlog = { ...vlogData, ...serverData };

          if (old.data?.data)
            return { ...old, data: { ...old.data, data: mergedVlog } };
          if (old.data) return { ...old, data: mergedVlog };
          return mergedVlog;
        });
      }

       // Dynamic toast based on server response (Truthful)
      const isDisliked = response?.data?.data?.isDisliked;
      const message = isDisliked ? "Capsule disliked" : "Capsule dislike removed";
      showToast(message, "success");
    },
    onError: (error, vlogId, context) => {
      if (context?.skipUpdate || error.message === "Not authenticated") return;

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
      }

      showToast(error.message || "Failed to dislike capsule", "error");
    },
    onSettled: (_data, _error, vlogId, context) => {
      if (context?.skipUpdate) return;

      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["vlog", vlogId] });
      queryClient.invalidateQueries({ queryKey: ["vlogs"] });
      queryClient.invalidateQueries({ queryKey: ["exploreVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["featuredVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["latestVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["trendingVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["userVlogs"] });
      queryClient.invalidateQueries({ queryKey: ["likedVlogs"] });
    },
  });

  /**
   * Share a vlog
   * Uses native share API if available, otherwise copies to clipboard
   */
  const shareMutation = useMutation({
    mutationFn: async ({ vlogId, vlog }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to share vlogs", "info");
        // Navigate to login with return URL
        setTimeout(() => {
          navigate("/login", { state: { from: location.pathname } });
        }, 1500);
        throw new Error("Not authenticated");
      }

      const shareUrl = `${window.location.origin}/vlog/${vlogId}`;

      try {
        // Try native share API first
        if (navigator.share) {
          await navigator.share({
            title: vlog.title,
            text: vlog.description,
            url: shareUrl,
          });
        } else {
          // Fallback to clipboard
          await navigator.clipboard.writeText(shareUrl);
          showToast("Link copied to clipboard!", "success");
        }

        // Increment share count on backend
        return await vlogAPI.shareVlog(vlogId);
      } catch (error) {
        // User cancelled share dialog
        if (error.name === "AbortError") {
          throw new Error("Share cancelled");
        }
        throw error;
      }
    },
    onMutate: async ({ vlogId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(["vlog", vlogId]);

      // Snapshot previous value
      const previousVlog = queryClient.getQueryData(["vlog", vlogId]);

      // Optimistically increment share count
      queryClient.setQueryData(["vlog", vlogId], (old) => {
        if (!old) return old;

        const vlogData = old.data?.data || old.data || old;
        const updatedVlog = {
          ...vlogData,
          shares: (vlogData.shares || 0) + 1,
        };

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } };
        } else if (old.data) {
          return { ...old, data: updatedVlog };
        }
        return updatedVlog;
      });

      return { previousVlog };
    },
    onSuccess: (_response, { _vlogId }) => {
      showToast("Capsule shared successfully!", "success");
    },
    onError: (error, { vlogId }, context) => {
      // Don't show error for cancelled shares
      if (
        error.message === "Share cancelled" ||
        error.message === "Not authenticated"
      ) {
        // Rollback share count
        if (context?.previousVlog) {
          queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
        }
        return;
      }

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
      }

      showToast(error.message || "Failed to share capsule", "error");
    },
    onSettled: (_data, error, { vlogId }) => {
      // Skip refetch if share was cancelled or not authenticated
      if (
        error?.message === "Share cancelled" ||
        error?.message === "Not authenticated"
      ) {
        return;
      }

      // Refetch to ensure consistency
      queryClient.invalidateQueries(["vlog", vlogId]);
      queryClient.invalidateQueries(["vlogs"]);
      queryClient.invalidateQueries(["trending"]);
      queryClient.invalidateQueries(["userVlogs"]);
    },
  });

  /**
   * Toggle bookmark on a vlog
   */
  const bookmarkMutation = useMutation({
    mutationFn: async ({ vlogId, isBookmarked }) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to bookmark vlogs", "info");
        // Navigate to login with return URL
        setTimeout(() => {
          navigate("/login", { state: { from: location.pathname } });
        }, 1500);
        throw new Error("Not authenticated");
      }

      if (isBookmarked) {
        return await userAPI.removeBookmark(vlogId);
      } else {
        return await userAPI.addBookmark(vlogId);
      }
    },
    onMutate: async ({ vlogId, isBookmarked }) => {
      if (!isAuthenticated) {
        return { skipUpdate: true };
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries(["vlog", vlogId]);
      await queryClient.cancelQueries(["bookmarks"]);

      // Snapshot previous values
      const previousVlog = queryClient.getQueryData(["vlog", vlogId]);

      // Cancel all bookmark queries
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });

      // Optimistically update bookmark state in vlog
      queryClient.setQueryData(["vlog", vlogId], (old) => {
        if (!old) return old;

        const vlogData = old.data?.data || old.data || old;
        const updatedVlog = {
          ...vlogData,
          isBookmarked: !isBookmarked,
        };

        // Preserve response structure
        if (old.data?.data) {
          return { ...old, data: { ...old.data, data: updatedVlog } };
        } else if (old.data) {
          return { ...old, data: updatedVlog };
        }
        return updatedVlog;
      });

      // Optimistically update all bookmarks queries
      queryClient.setQueriesData({ queryKey: ["bookmarks"] }, (old) => {
        if (!old) return old;

        const bookmarks = old.data || [];

        let updatedBookmarks;
        if (isBookmarked) {
          // Remove from bookmarks
          updatedBookmarks = bookmarks.filter((b) => b._id !== vlogId);
        } else {
          // We don't add to bookmarks optimistically since we don't have full vlog data
          updatedBookmarks = bookmarks;
        }

        // Update total count
        const newTotal = isBookmarked ? (old.total || 0) - 1 : old.total || 0;

        return {
          ...old,
          data: updatedBookmarks,
          total: newTotal,
        };
      });

      return { previousVlog };
    },
    onSuccess: (_response, { _vlogId, isBookmarked }) => {
      const message = isBookmarked ? "Bookmark removed" : "Capsule bookmarked";
      showToast(message, "success");
    },
    onError: (error, { vlogId }, context) => {
      if (error.message === "Not authenticated") {
        return;
      }

      // Rollback on error
      if (context?.previousVlog) {
        queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
      }

      showToast(error.message || "Failed to update bookmark", "error");
    },
    onSettled: (_data, error, { vlogId }) => {
      if (error?.message === "Not authenticated") {
        return;
      }

      // Refetch to ensure consistency
      queryClient.invalidateQueries(["vlog", vlogId]);
      queryClient.invalidateQueries(["vlogs"]);
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries(["user", "me"]);
    },
  });

  /**
   * Add a comment to a vlog
   */
  const addCommentMutation = useMutation({
    mutationFn: async ({ vlogId, text }) => {
      if (!isAuthenticated) throw new Error("Not authenticated");
      // CRITICAL FIX: Pass text directly, api.js helper handles the object wrapping
      return vlogAPI.addComment(vlogId, text);
    },
    onMutate: async ({ vlogId, text, user }) => {
      await queryClient.cancelQueries(["vlog", vlogId]);

      const previousVlog = queryClient.getQueryData(["vlog", vlogId]);

      queryClient.setQueryData(["vlog", vlogId], (old) => {
        if (!old) return old;
        const vlogData = old.data?.data || old.data || old;

        // Create temporary optimistic comment
        const tempComment = {
          _id: `temp-${Date.now()}`,
          text,
          user: {
            _id: user._id,
            username: user.username,
            avatar: user.avatar,
          },
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        };

        const updatedVlog = {
          ...vlogData,
          commentCount: (vlogData.commentCount || 0) + 1,
          comments: [tempComment, ...(vlogData.comments || [])],
        };

        if (old.data?.data)
          return { ...old, data: { ...old.data, data: updatedVlog } };
        if (old.data) return { ...old, data: updatedVlog };
        return updatedVlog;
      });

      return { previousVlog };
    },
    onError: (err, { vlogId }, context) => {
      if (context?.previousVlog) {
        queryClient.setQueryData(["vlog", vlogId], context.previousVlog);
      }
      showToast(err.message || "Failed to post comment", "error");
    },
    onSettled: (_data, _error, { vlogId }) => {
      queryClient.invalidateQueries(["vlog", vlogId]);
    },
  });

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
    toggleBookmark: (vlogId, isBookmarked) =>
      bookmarkMutation.mutate({ vlogId, isBookmarked }),
    isBookmarking: bookmarkMutation.isPending,

    // Comments
    addComment: (vlogId, text, user) =>
      addCommentMutation.mutate({ vlogId, text, user }),
    isAddingComment: addCommentMutation.isPending,
  };
};
