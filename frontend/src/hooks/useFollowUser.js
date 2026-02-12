import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userAPI } from "../services/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { updateFollowCache } from "../utils/cacheHelpers";

export const useFollowUser = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Follow mutation with optimistic updates
  const followMutation = useMutation({
    mutationFn: (userId) => userAPI.followUser(userId),
    onMutate: async (userId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to follow users", "info");
        navigate("/login", { state: { from: window.location.pathname } });
        throw new Error("Not authenticated");
      }

      // Cancel outgoing queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ["user", userId] });
      await queryClient.cancelQueries({ queryKey: ["currentUser"] });
      await queryClient.cancelQueries({ queryKey: ["vlogs"] });
      await queryClient.cancelQueries({ queryKey: ["vlog"] });

      // Snapshot previous state for rollback
      const previousUserData = queryClient.getQueryData(["user", userId]);
      const previousCurrentUser = queryClient.getQueryData(["currentUser"]);
      const previousVlogs = queryClient.getQueriesData({ queryKey: ["vlogs"] });
      const previousVlog = queryClient.getQueriesData({ queryKey: ["vlog"] });

      // Optimistically update using unified function
      updateFollowCache(queryClient, userId, true, user._id);

      return {
        previousUserData,
        previousCurrentUser,
        previousVlogs,
        previousVlog,
      };
    },
    onSuccess: (response) => {
      showToast("User followed!", "success");

      // Use server response to ensure accuracy
      const { following } = response.data.data;
      if (following) {
        queryClient.setQueryData(["currentUser"], (old) => ({
          ...old,
          following,
        }));
      }

      // Invalidate caches to update UI reactively
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      queryClient.invalidateQueries({ queryKey: ["vlog"] });
    },
    onError: (error, userId, context) => {
      // Rollback optimistic updates
      if (context?.previousUserData) {
        queryClient.setQueryData(["user", userId], context.previousUserData);
      }
      if (context?.previousCurrentUser) {
        queryClient.setQueryData(["currentUser"], context.previousCurrentUser);
      }
      if (context?.previousVlogs) {
        context.previousVlogs.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousVlog) {
        context.previousVlog.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

      showToast(error.message || "Failed to follow user", "error");
    },
    onSettled: (data, error, userId) => {
      // Only invalidate specific queries, not everything
      queryClient.invalidateQueries({
        queryKey: ["user", userId],
        exact: true,
      });
      queryClient.invalidateQueries({ queryKey: ["currentUser"], exact: true });
      // Invalidate followers/following lists for real-time updates
      queryClient.invalidateQueries({ queryKey: ["followers"] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
    },
  });

  // Unfollow mutation with optimistic updates
  const unfollowMutation = useMutation({
    mutationFn: (userId) => userAPI.unfollowUser(userId),
    onMutate: async (userId) => {
      // Check authentication
      if (!isAuthenticated) {
        showToast("Please log in to unfollow users", "info");
        navigate("/login", { state: { from: window.location.pathname } });
        throw new Error("Not authenticated");
      }

      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ["user", userId] });
      await queryClient.cancelQueries({ queryKey: ["currentUser"] });
      await queryClient.cancelQueries({ queryKey: ["vlogs"] });
      await queryClient.cancelQueries({ queryKey: ["vlog"] });

      // Snapshot previous state
      const previousUserData = queryClient.getQueryData(["user", userId]);
      const previousCurrentUser = queryClient.getQueryData(["currentUser"]);
      const previousVlogs = queryClient.getQueriesData({ queryKey: ["vlogs"] });
      const previousVlog = queryClient.getQueriesData({ queryKey: ["vlog"] });

      // Optimistically update using unified function
      updateFollowCache(queryClient, userId, false, user._id);

      return {
        previousUserData,
        previousCurrentUser,
        previousVlogs,
        previousVlog,
      };
    },
    onSuccess: (response) => {
      showToast("User unfollowed", "success");

      // Use server response to ensure accuracy
      const { following } = response.data.data;
      if (following) {
        queryClient.setQueryData(["currentUser"], (old) => ({
          ...old,
          following,
        }));
      }

      // Invalidate caches to update UI reactively
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      queryClient.invalidateQueries({ queryKey: ["vlog"] });
    },
    onError: (error, userId, context) => {
      // Rollback optimistic updates
      if (context?.previousUserData) {
        queryClient.setQueryData(["user", userId], context.previousUserData);
      }
      if (context?.previousCurrentUser) {
        queryClient.setQueryData(["currentUser"], context.previousCurrentUser);
      }
      if (context?.previousVlogs) {
        context.previousVlogs.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousVlog) {
        context.previousVlog.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

      showToast(error.message || "Failed to unfollow user", "error");
    },
    onSettled: (data, error, userId) => {
      // Only invalidate specific queries
      queryClient.invalidateQueries({
        queryKey: ["user", userId],
        exact: true,
      });
      queryClient.invalidateQueries({ queryKey: ["currentUser"], exact: true });
      // Invalidate followers/following lists for real-time updates
      queryClient.invalidateQueries({ queryKey: ["followers"] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
    },
  });

  return {
    followUser: (userId) => followMutation.mutate(userId),
    unfollowUser: (userId) => unfollowMutation.mutate(userId),
    isFollowing: followMutation.isPending,
    isUnfollowing: unfollowMutation.isPending,
  };
};
