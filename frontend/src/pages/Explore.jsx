import { motion } from "framer-motion";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { vlogAPI } from "../services/api";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import Button from "../components/UI/Button";

const Explore = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const categories = [
    "all",
    "technology",
    "travel",
    "lifestyle",
    "food",
    "fashion",
    "fitness",
    "music",
    "art",
    "business",
    "education",
    "entertainment",
    "gaming",
    "sports",
    "health",
    "science",
    "photography",
    "diy",
    "other",
  ];

  const sortOptions = [
    { value: "newest", label: "Newest" },
    { value: "popular", label: "Most Popular" },
    { value: "liked", label: "Most Liked" },
    { value: "alphabetical", label: "Alphabetical" },
  ];

  // Fetch vlogs based on filters
  const {
    data: vlogsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["exploreVlogs", selectedCategory, sortBy, searchQuery],
    queryFn: ({ pageParam = 1 }) =>
      vlogAPI.getVlogs({
        page: pageParam,
        limit: 12,
        category: selectedCategory !== "all" ? selectedCategory : undefined,
        sort: sortBy,
        search: searchQuery || undefined,
      }),
    getNextPageParam: (lastPage) => {
      if (lastPage.data.currentPage < lastPage.data.totalPages) {
        return lastPage.data.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const allVlogs = vlogsData?.pages?.flatMap((page) => page.data.data) || [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
          Explore Content
        </h1>
        <p className="text-xl text-[var(--theme-text-secondary)] max-w-2xl">
          Discover amazing capsules from creators around the world
        </p>
      </motion.div>

      {/* Search and Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-6 rounded-2xl mb-8"
      >
        {/* Search Bar */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search capsules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass-input"
          />
        </div>

        {/* Category Filter */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-[var(--theme-text)] mb-3">
            Categories
          </h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  selectedCategory === category
                    ? "bg-[var(--theme-accent)] text-white"
                    : "glass-hover text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Sort Options */}
        <div>
          <h3 className="text-sm font-medium text-[var(--theme-text)] mb-3">
            Sort By
          </h3>
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  sortBy === option.value
                    ? "bg-[var(--theme-secondary)] text-white"
                    : "glass-hover text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Results Count */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-6"
      >
        <p className="text-[var(--theme-text-secondary)]">
          Showing {allVlogs.length} capsules
          {selectedCategory !== "all" && ` in ${selectedCategory}`}
          {searchQuery && ` for "${searchQuery}"`}
        </p>
      </motion.div>

      {/* Vlogs Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-48 bg-gray-600 rounded-xl mb-4"></div>
              <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-600 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : allVlogs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {allVlogs.map((vlog, index) => (
            <motion.div
              key={vlog._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.05 }}
            >
              <CapsuleCard vlog={vlog} compact />
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-20"
        >
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[var(--glass-white)] flex items-center justify-center">
            <svg
              className="w-12 h-12 text-[var(--theme-text-secondary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-[var(--theme-text)] mb-2">
            No capsules found
          </h3>
          <p className="text-[var(--theme-text-secondary)] mb-6">
            Try adjusting your search or filters to find more content
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
              setSortBy("newest");
            }}
          >
            Clear Filters
          </Button>
        </motion.div>
      )}

      {/* Load More Button */}
      {hasNextPage && (
        <div className="text-center mt-12">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            loading={isFetchingNextPage}
          >
            Load More Capsules
          </Button>
        </div>
      )}
    </div>
  );
};

export default Explore;
