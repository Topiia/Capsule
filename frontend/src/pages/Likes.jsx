import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Button from "../components/UI/Button";
import {
  HeartIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/24/outline";
import { vlogAPI, userAPI } from "../services/api";

const Likes = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const queryClient = useQueryClient();

  // Fetch liked vlogs
  const {
    data: likes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["likedVlogs", sortBy, categoryFilter],
    queryFn: async () => {
      const response = await userAPI.getLikedVlogs({
        sort: sortBy,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      });
      return response.data;
    },
  });

  // Unlike mutation
  const unlikeMutation = useMutation({
    mutationFn: async (vlogId) => {
      // Use the dislikeVlog API endpoint to unlike
      return await vlogAPI.dislikeVlog(vlogId);
    },
    onMutate: async (vlogId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(["likedVlogs"]);

      // Snapshot previous value
      const previousLikes = queryClient.getQueryData([
        "likedVlogs",
        sortBy,
        categoryFilter,
      ]);

      // Optimistically update - remove the vlog from the likes list
      queryClient.setQueryData(
        ["likedVlogs", sortBy, categoryFilter],
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter((vlog) => vlog._id !== vlogId),
          };
        },
      );

      return { previousLikes };
    },
    onError: (_err, _vlogId, context) => {
      // Rollback on error
      queryClient.setQueryData(
        ["likedVlogs", sortBy, categoryFilter],
        context.previousLikes,
      );
      toast.error("Failed to unlike vlog");
    },
    onSuccess: () => {
      toast.success("Capsule unliked");
    },
    onSettled: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries(["likedVlogs"]);
    },
  });

  const handleUnlike = (vlogId) => {
    unlikeMutation.mutate(vlogId);
  };

  // Filter likes by search query
  const filteredLikes =
    likes?.data?.filter((vlog) => {
      if (!searchQuery) return true;
      return (
        vlog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vlog.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vlog.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      );
    }) || [];

  const categories = [
    "all",
    "tech",
    "lifestyle",
    "travel",
    "food",
    "gaming",
    "education",
    "entertainment",
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center space-x-3 mb-2">
          <HeartIcon className="w-8 h-8 text-[var(--theme-accent)]" />
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">
            Liked Capsules
          </h1>
        </div>
        <p className="text-[var(--theme-text-secondary)]">
          Capsules you&apos;ve shown some love
        </p>
      </motion.div>

      {/* Filters and Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-4 md:p-6 mb-8"
      >
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search liked capsules..."
                className="w-full pl-10 pr-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-2">
            <FunnelIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center space-x-2">
            <ArrowsUpDownIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
            >
              <option value="date">Date Liked</option>
              <option value="title">Title</option>
              <option value="views">Most Viewed</option>
              <option value="likes">Most Liked</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Likes Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="large" />
          </div>
        ) : error || !likes?.data || filteredLikes.length === 0 ? (
          /* Empty State */
          <div className="glass-card rounded-2xl p-12 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[var(--glass-white)] flex items-center justify-center">
                <HeartIcon className="w-12 h-12 text-[var(--theme-text-secondary)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-3">
                {searchQuery ? "No liked capsules found" : "No liked capsules yet"}
              </h2>
              <p className="text-[var(--theme-text-secondary)] mb-6 max-w-md mx-auto">
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : "Start liking capsules to build your collection of favorites"}
              </p>
              {!searchQuery && (
                <Link to="/trending">
                  <Button variant="primary">Discover Trending</Button>
                </Link>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredLikes.map((vlog, index) => (
              <motion.div
                key={vlog._id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="relative"
              >
                {/* Unlike Button */}
                <button
                  onClick={() => handleUnlike(vlog._id)}
                  className="absolute top-2 right-2 z-10 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full backdrop-blur-sm transition-all duration-200"
                  title="Unlike capsule"
                >
                  <HeartIcon className="w-4 h-4" />
                </button>

                <CapsuleCard vlog={vlog} compact />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Results Count */}
      {!isLoading && filteredLikes.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center text-[var(--theme-text-secondary)]"
        >
          Showing {filteredLikes.length} liked capsule
          {filteredLikes.length !== 1 ? "s" : ""}
        </motion.div>
      )}
    </div>
  );
};

export default Likes;
