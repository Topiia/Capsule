import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import Button from "../components/UI/Button";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useBookmarks } from "../hooks/useBookmarks";

const Bookmarks = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  // Fetch bookmarked vlogs using the custom hook
  const {
    bookmarks,
    pagination,
    isLoading,
    error,
    hasNextPage,
    hasPreviousPage,
  } = useBookmarks({ page: currentPage, limit });

  const handleNextPage = () => {
    if (hasNextPage) {
      setCurrentPage((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      setCurrentPage((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center space-x-3 mb-2">
          <BookmarkIcon className="w-8 h-8 text-[var(--theme-accent)]" />
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">
            Bookmarks
          </h1>
        </div>
        <p className="text-[var(--theme-text-secondary)]">
          Your saved capsules for later viewing
        </p>
      </motion.div>

      {/* Bookmarks Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="large" />
          </div>
        ) : error || !bookmarks || bookmarks.length === 0 ? (
          /* Empty State */
          <div className="glass-card rounded-2xl p-12 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[var(--glass-white)] flex items-center justify-center">
                <BookmarkIcon className="w-12 h-12 text-[var(--theme-text-secondary)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-3">
                No bookmarks yet
              </h2>
              <p className="text-[var(--theme-text-secondary)] mb-6 max-w-md mx-auto">
                Start bookmarking capsules to save them for later viewing
              </p>
              <Link to="/explore">
                <Button variant="primary">Explore Capsules</Button>
              </Link>
            </motion.div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {bookmarks.map((vlog, index) => (
                <motion.div
                  key={vlog._id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                >
                  <CapsuleCard vlog={{ ...vlog, isBookmarked: true }} compact />
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-8 flex items-center justify-center space-x-4"
              >
                <Button
                  variant="ghost"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage}
                  leftIcon={<ChevronLeftIcon className="w-4 h-4" />}
                >
                  Previous
                </Button>

                <div className="flex items-center space-x-2">
                  <span className="text-[var(--theme-text)]">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                  rightIcon={<ChevronRightIcon className="w-4 h-4" />}
                >
                  Next
                </Button>
              </motion.div>
            )}

            {/* Results Count */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-4 text-center text-[var(--theme-text-secondary)]"
            >
              Showing {bookmarks.length} of {pagination.total} bookmark
              {pagination.total !== 1 ? "s" : ""}
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default Bookmarks;
