import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { vlogAPI } from "../services/api";
import { useDeleteVlog } from "../hooks/useVlogMutations";
import { useVlogInteractions } from "../hooks/useVlogInteractions";
import { useComments } from "../hooks/useComments";
import { useVlogView } from "../hooks/useVlogView";

import LoadingSpinner from "../components/UI/LoadingSpinner";
import Button from "../components/UI/Button";
import DeleteConfirmModal from "../components/UI/DeleteConfirmModal";
import FollowButton from "../components/UI/FollowButton";

import {
  HeartIcon,
  EyeIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  BookmarkIcon,
  FlagIcon,
  PencilIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  HandThumbDownIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartIconSolid,
  BookmarkIcon as BookmarkIconSolid,
  HandThumbDownIcon as HandThumbDownIconSolid,
} from "@heroicons/react/24/solid";

const CapsuleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  // Fetch vlog details
  const { data: vlog, isLoading } = useQuery({
    queryKey: ["vlog", id],
    queryFn: () => vlogAPI.getVlog(id),
    select: (response) => response.data.data,
  });

  // Record view automatically
  useVlogView(id);

  // Delete mutation with optimistic updates
  const deleteMutation = useDeleteVlog(id);

  // Interaction hooks
  const {
    toggleLike,
    toggleDislike,
    shareVlog,
    toggleBookmark,
    addComment,
    isLiking,
    isDisliking,
    isSharing,
    isBookmarking,
    isAddingComment,
  } = useVlogInteractions();

  // Compute interaction states - rely on boolean flags from backend/optimistic updates
  const isLiked = !!(vlog?.isLiked);
  const isDisliked = !!(vlog?.isDisliked);
  const isBookmarked = !!(vlog?.isBookmarked);

  const likeCount = vlog?.likeCount || 0;
  const dislikeCount = vlog?.dislikeCount || 0;

  // Comment hooks
  const { deleteComment, isDeleting } = useComments();

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onError: () => {
        setShowDeleteModal(false);
      },
    });
  };

  const handleEdit = () => {
    navigate(`/vlog/${id}/edit`);
  };

  const handleLike = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (vlog?._id) toggleLike(vlog._id);
  };

  const handleDislike = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (vlog?._id) toggleDislike(vlog._id);
  };

  const handleShare = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (vlog?._id) shareVlog(vlog._id, vlog);
  };

  const handleBookmark = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (vlog?._id) toggleBookmark(vlog._id, isBookmarked);
  };

  const handleCommentSubmit = () => {
    if (!isAuthenticated) {
      // Show toast notification for unauthenticated users
      return;
    }

    if (!commentText.trim()) return;
    
    if (commentText.length > 500) {
      return;
    }

    if (vlog?._id && user) {
      addComment(vlog._id, commentText, user);
      setCommentText(""); // Clear form after successful post
    }
  };

  const handleCommentDelete = (commentId) => {
    deleteComment(id, commentId);
  };

  const canDeleteComment = (comment) => {
    if (!user) return false;
    // User can delete their own comment or if they're the vlog owner
    return comment.user?._id === user.id || isOwner;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num?.toString() || "0";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!vlog) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--theme-text)] mb-4">
            Capsule Not Found
          </h1>
          <p className="text-[var(--theme-text-secondary)]">
            The capsule you&apos;re looking for doesn&apos;t exist
          </p>
        </div>
      </div>
    );
  }

  const isOwner = user && vlog.author && (user._id || user.id) === (vlog.author._id || vlog.author.id);

  return (
    <div className="w-full">
      {/* Vlog Content */}
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          {/* Category and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center flex-wrap gap-3">
              <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium rounded-full">
                {vlog.category}
              </span>
              <span className="text-sm text-[var(--theme-text-secondary)]">
                {formatDate(vlog.createdAt)}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Edit/Delete Actions for Owner */}
              {isOwner && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<EllipsisVerticalIcon className="w-5 h-5" />}
                    onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    className="relative backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20"
                  >
                    Options
                  </Button>

                  {showOptionsMenu && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                        onClick={() => setShowOptionsMenu(false)}
                      />

                      {/* Menu */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 mt-2 w-56 glass-card rounded-2xl shadow-2xl z-50 overflow-hidden border border-[var(--glass-border)]"
                      >
                        <button
                          onClick={() => {
                            handleEdit();
                            setShowOptionsMenu(false);
                          }}
                          className="w-full px-5 py-3.5 text-left flex items-center space-x-3 hover:bg-white/10 transition-all duration-200 group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <PencilIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-[var(--theme-text)] font-medium">
                            Edit Capsule
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteModal(true);
                            setShowOptionsMenu(false);
                          }}
                          className="w-full px-5 py-3.5 text-left flex items-center space-x-3 hover:bg-white/10 transition-all duration-200 border-t border-white/10 group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <TrashIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-red-400 font-medium">
                            Delete Capsule
                          </span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </div>
              )}

              {/* Other Actions */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isBookmarking ? { scale: [1, 1.05, 1] } : {}}
                transition={
                  isBookmarking ? { repeat: Infinity, duration: 0.6 } : {}
                }
                title={
                  !isAuthenticated
                    ? "Login to interact"
                    : vlog?.isBookmarked
                      ? "Remove bookmark"
                      : "Bookmark"
                }
              >
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={
                    isBookmarked ? (
                      <BookmarkIconSolid className="w-5 h-5" />
                    ) : (
                      <BookmarkIcon className="w-5 h-5" />
                    )
                  }
                  onClick={handleBookmark}
                  disabled={isBookmarking}
                  className={`backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300 ${
                    isBookmarked
                      ? "bg-gradient-to-r from-[var(--theme-accent)]/20 to-[var(--theme-secondary)]/20 border-[var(--theme-accent)]/30 text-[var(--theme-accent)]"
                      : ""
                  }`}
                >
                  {isBookmarking
                    ? "Saving..."
                    : isBookmarked
                      ? "Saved"
                      : "Save"}
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isSharing ? { scale: [1, 1.05, 1] } : {}}
                transition={
                  isSharing ? { repeat: Infinity, duration: 0.6 } : {}
                }
                title={!isAuthenticated ? "Login to interact" : "Share"}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ShareIcon className="w-5 h-5" />}
                  onClick={handleShare}
                  disabled={isSharing}
                  className="backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
                >
                  {isSharing ? "Sharing..." : "Share"}
                </Button>
              </motion.div>
              {!isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<FlagIcon className="w-5 h-5" />}
                  className="backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20"
                >
                  Report
                </Button>
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--theme-text)] mb-6">
            {vlog.title}
          </h1>

          {/* Author Info */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                {vlog.author?.avatar ? (
                  <img
                    src={vlog.author.avatar}
                    alt={vlog.author.username}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-white font-semibold text-lg">
                    {vlog.author?.username?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-[var(--theme-text)] text-base sm:text-lg">
                  {vlog.author?.username || "Unknown"}
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  {vlog.author?.bio || "Content Creator"}
                </p>
              </div>
            </div>
            {!isOwner && vlog.author && (
              <FollowButton
                userId={vlog.author._id}
                username={vlog.author.username}
                className="w-full sm:w-auto"
              />
            )}
          </div>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left Column - Images */}
          <div className="w-full lg:w-7/12">
            {vlog.images && vlog.images.length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-6 flex flex-col items-center"
              >
                {vlog.images.map((image, index) => (
                  <div
                    key={index}
                    className="relative cursor-pointer group inline-flex justify-center"
                    onClick={() => setSelectedImage(image.url)}
                  >
                    <img
                      src={image.url}
                      alt={image.caption || `Capsule image ${index + 1}`}
                      className="block h-auto w-auto max-w-full max-h-[55vh] object-contain rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none rounded-lg">
                      <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm backdrop-blur-md font-medium shadow-md transform scale-90 group-hover:scale-100 transition-all">
                        Expand
                      </span>
                    </div>
                    {image.caption && (
                      <p className="mt-2 text-sm text-[var(--theme-text-secondary)] italic text-center w-full">
                        {image.caption}
                      </p>
                    )}
                  </div>
                ))}
              </motion.div>
            ) : null}
          </div>

          {/* Right Column - Content & Sidebar */}
          <div className="w-full lg:w-5/12">
            <div className="lg:sticky lg:top-24 space-y-8">
              {/* Description */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="glass-card p-6 rounded-xl">
                  <h2 className="text-xl font-semibold text-[var(--theme-text)] mb-4">
                    Description
                  </h2>
                  <p className="text-[var(--theme-text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {vlog.description}
                  </p>
                </div>
              </motion.div>

              {/* Content Section */}
              {vlog.content && vlog.content.trim() && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                >
                  <div className="glass-card p-6 rounded-xl">
                    <h2 className="text-xl font-semibold text-[var(--theme-text)] mb-4">
                      Full Content
                    </h2>
                    <div className="text-[var(--theme-text-secondary)] leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none">
                      {vlog.content}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tags */}
              {vlog.tags && vlog.tags.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex flex-wrap gap-2">
                    {vlog.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-[var(--glass-white)] text-[var(--theme-text)] text-sm rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Engagement Stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="glass-card p-4 sm:p-6 rounded-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center flex-wrap gap-4 sm:gap-6">
                    <div className="flex items-center space-x-2">
                      <EyeIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <motion.span
                        key={vlog.views}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-[var(--theme-text)] font-medium"
                      >
                        {formatNumber(vlog.views || 0)}
                      </motion.span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <HeartIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <motion.span
                        key={likeCount}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-[var(--theme-text)] font-medium"
                      >
                        {formatNumber(likeCount)}
                      </motion.span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <HandThumbDownIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <motion.span
                        key={dislikeCount}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-[var(--theme-text)] font-medium"
                      >
                        {formatNumber(dislikeCount)}
                      </motion.span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <ChatBubbleLeftIcon className="w-5 h-5 text-[var(--theme-text-secondary)]" />
                      <motion.span
                        key={vlog.commentCount || vlog.comments?.length}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-[var(--theme-text)] font-medium"
                      >
                        {formatNumber(vlog.commentCount || vlog.comments?.length || 0)}
                      </motion.span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      animate={isLiking ? { scale: [1, 1.05, 1] } : {}}
                      transition={
                        isLiking ? { repeat: Infinity, duration: 0.6 } : {}
                      }
                      title={
                        !isAuthenticated
                          ? "Login to interact"
                          : isLiked
                            ? "Unlike"
                            : "Like"
                      }
                    >
                      <Button
                        variant={
                          isLiked ? "primary" : "ghost"
                        }
                        size="sm"
                        leftIcon={
                          isLiked ? (
                            <HeartIconSolid className="w-5 h-5" />
                          ) : (
                            <HeartIcon className="w-5 h-5" />
                          )
                        }
                        onClick={handleLike}
                        disabled={isLiking}
                        className={
                          isLiked
                            ? "bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 shadow-lg shadow-red-500/30 border-0 transition-all duration-300"
                            : "backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
                        }
                      >
                        {isLiking
                          ? "Loading..."
                          : isLiked
                            ? "Liked"
                            : "Like"}
                      </Button>
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      animate={isDisliking ? { scale: [1, 1.05, 1] } : {}}
                      transition={
                        isDisliking ? { repeat: Infinity, duration: 0.6 } : {}
                      }
                      title={
                        !isAuthenticated
                          ? "Login to interact"
                          : isDisliked
                            ? "Remove dislike"
                            : "Dislike"
                      }
                    >
                      <Button
                        variant={
                          isDisliked
                            ? "primary"
                            : "ghost"
                        }
                        size="sm"
                        leftIcon={
                          isDisliked ? (
                            <HandThumbDownIconSolid className="w-5 h-5" />
                          ) : (
                            <HandThumbDownIcon className="w-5 h-5" />
                          )
                        }
                        onClick={handleDislike}
                        disabled={isDisliking}
                        className={
                          isDisliked
                            ? "bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] hover:opacity-90 shadow-lg border-0 transition-all duration-300"
                            : "backdrop-blur-md bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
                        }
                      >
                        {isDisliking
                          ? "Loading..."
                          : isDisliked
                            ? "Disliked"
                            : "Dislike"}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* Author Info Card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="glass-card p-6 rounded-xl"
              >
                <h3 className="font-semibold text-[var(--theme-text)] mb-4">
                  About the Author
                </h3>
                <div className="text-center mb-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center mb-3">
                    {vlog.author?.avatar ? (
                      <img
                        src={vlog.author.avatar}
                        alt={vlog.author.username}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-bold text-2xl">
                        {vlog.author?.username?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h4 className="font-medium text-[var(--theme-text)]">
                    {vlog.author?.username}
                  </h4>
                  <p className="text-sm text-[var(--theme-text-secondary)]">
                    {vlog.author?.followerCount || 0} followers
                  </p>
                </div>
                {vlog.author?.bio && (
                  <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
                    {vlog.author.bio}
                  </p>
                )}
                {!isOwner && vlog.author && (
                  <FollowButton
                    userId={vlog.author._id}
                    username={vlog.author.username}
                    variant="primary"
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                  />
                )}
              </motion.div>

              {/* More from this creator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="glass-card p-6 rounded-xl"
              >
                <h3 className="font-semibold text-[var(--theme-text)] mb-4">
                  More from {vlog.author?.username}
                </h3>
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <p className="text-sm text-[var(--theme-text-secondary)]">
                      More content coming soon...
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Comments Section */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="glass-card p-6 rounded-xl"
              >
                <h2 className="text-xl font-semibold text-[var(--theme-text)] mb-6">
                  Comments ({vlog.comments?.length || 0})
                </h2>

                {/* Comment Form */}
                {isAuthenticated ? (
                  <div className="mb-6">
                    <div className="flex space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                        {user?.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-white font-semibold">
                            {user?.username?.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <textarea
                          placeholder="Add a comment..."
                          className="glass-input w-full"
                          rows={3}
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          disabled={isAddingComment}
                        />
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="primary"
                            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                            onClick={handleCommentSubmit}
                            disabled={isAddingComment || !commentText.trim()}
                          >
                            {isAddingComment ? "Posting..." : "Post Comment"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 glass-card p-4 rounded-xl text-center">
                    <p className="text-[var(--theme-text-secondary)] mb-3">
                      Please log in to comment on this capsule
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                      onClick={() =>
                        navigate("/login", { state: { from: `/vlog/${id}` } })
                      }
                    >
                      Log In
                    </Button>
                  </div>
                )}

                {/* Comments List */}
                <div className="space-y-4">
                  {vlog.comments && vlog.comments.length > 0 ? (
                    vlog.comments.map((comment) => (
                      <div key={comment._id} className="flex space-x-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                          {comment.user?.avatar ? (
                            <img
                              src={comment.user.avatar}
                              alt={comment.user.username}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-white text-sm font-semibold">
                              {comment.user?.username?.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-[var(--theme-text)]">
                                {comment.user?.username}
                              </span>
                              <span className="text-xs text-[var(--theme-text-secondary)]">
                                {formatDate(comment.createdAt)}
                              </span>
                            </div>
                            {canDeleteComment(comment) && (
                              <button
                                onClick={() => handleCommentDelete(comment._id)}
                                disabled={isDeleting}
                                className="text-red-400 hover:text-red-300 text-sm transition-colors disabled:opacity-50"
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
                            )}
                          </div>
                          <p className="text-[var(--theme-text-secondary)] text-sm whitespace-pre-wrap break-words">
                            {/* DEFENSIVE RENDER: Handle both legacy 'text' and new contract 'content' */}
                            {(() => {
                                const rawContent = comment.content || comment.text;
                                if (typeof rawContent === 'string') return rawContent;
                                if (typeof rawContent === 'object') return "[Invalid Content]"; 
                                return "";
                            })()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-[var(--theme-text-secondary)]">
                        No comments yet. Be the first to comment!
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-[80vw] max-h-[80vh] w-auto h-auto flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-4 -right-16 p-3 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all duration-200"
                title="Close"
              >
                <XMarkIcon className="w-8 h-8" />
              </button>
              <img
                src={selectedImage}
                alt="Full screen view"
                className="w-auto h-auto max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Capsule?"
        message="Are you sure you want to delete this capsule? This action cannot be undone and all images will be permanently removed."
        confirmText="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default CapsuleDetail;
