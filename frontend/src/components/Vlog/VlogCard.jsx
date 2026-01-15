import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { formatRelativeTime, formatNumber, truncateText } from '../../utils/helpers'
import { useAuth } from '../../contexts/AuthContext'
import { useVlogInteractions } from '../../hooks/useVlogInteractions'
import Button from '../UI/Button'
import FollowButton from '../UI/FollowButton'
import {
  HeartIcon,
  EyeIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  BookmarkIcon,
  PlayIcon,
  HandThumbDownIcon
} from '@heroicons/react/24/outline'
import {
  HeartIcon as HeartIconSolid,
  BookmarkIcon as BookmarkIconSolid,
  HandThumbDownIcon as HandThumbDownIconSolid
} from '@heroicons/react/24/solid'

// Utility to get initials from a username or full name
const getInitials = (name = "") => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};


const VlogCard = ({ vlog, featured = false, compact = false }) => {
  const { isAuthenticated, user } = useAuth()
  const {
    toggleLike,
    toggleDislike,
    shareVlog,
    toggleBookmark,
    isLiking,
    isDisliking,
    isSharing,
    isBookmarking
  } = useVlogInteractions()

  // Compute interaction states
  const isLiked = vlog.likes?.includes(user?._id) || false
  const isDisliked = vlog.dislikes?.includes(user?._id) || false
  const isBookmarked = vlog.isBookmarked || false
  const likeCount = vlog.likes?.length || 0
  const dislikeCount = vlog.dislikes?.length || 0

  const handleLike = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Hook will handle authentication check and show toast
    toggleLike(vlog._id)
  }

  const handleDislike = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Hook will handle authentication check and show toast
    toggleDislike(vlog._id)
  }

  const handleBookmark = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Hook will handle authentication check and show toast
    toggleBookmark(vlog._id, isBookmarked)
  }

  const handleShare = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Hook will handle authentication check and show toast
    shareVlog(vlog._id, vlog)
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    },
    hover: {
      y: -5,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25
      }
    }
  }

  const imageVariants = {
    hover: {
      scale: 1.05,
      transition: {
        duration: 0.3
      }
    }
  }

  if (compact) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        className="glass-card rounded-xl overflow-hidden group cursor-pointer"
      >
        <Link to={`/vlog/${vlog._id}`}>
          {/* Image */}
          <div className="relative aspect-video overflow-hidden">
            <motion.img
              variants={imageVariants}
              src={vlog.images?.[0]?.url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect width="400" height="225" fill="%23374151"/%3E%3Ctext x="50%25" y="50%25" fill="%23d1d5db" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E'}
              alt={vlog.title}
              className="w-full h-full object-cover"
            />

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Play Button */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                <PlayIcon className="w-6 h-6 text-white ml-1" />
              </div>
            </div>

            {/* Duration Badge */}
            {vlog.duration && (
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                {vlog.duration}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-3">
            <h3 className="font-semibold text-[var(--theme-text)] text-sm mb-1 line-clamp-2">
              {vlog.title}
            </h3>

            <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)]">
              <span>{vlog.author?.username}</span>
              <span>{formatRelativeTime(vlog.createdAt)}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center space-x-3 mt-2 text-xs text-[var(--theme-text-secondary)]">
              <div className="flex items-center space-x-1">
                <EyeIcon className="w-3 h-3" />
                <span>{formatNumber(vlog.views || 0)}</span>
              </div>
              <div className="flex items-center space-x-1">
                {isLiked ? (
                  <HeartIconSolid className="w-3 h-3 text-red-500" />
                ) : (
                  <HeartIcon className="w-3 h-3" />
                )}
                <span>{formatNumber(likeCount)}</span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      className={`glass-card rounded-2xl overflow-hidden group cursor-pointer ${featured ? 'lg:col-span-2' : ''
        }`}
    >
      <Link to={`/vlog/${vlog._id}`}>
        {/* Image Section */}
        <div className="relative aspect-video overflow-hidden">
          <motion.img
            variants={imageVariants}
            src={vlog.images?.[0]?.url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect width="400" height="225" fill="%23374151"/%3E%3Ctext x="50%25" y="50%25" fill="%23d1d5db" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E'}
            alt={vlog.title}
            className="w-full h-full object-cover"
          />

          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Play Button */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
            >
              <PlayIcon className="w-8 h-8 text-white ml-1" />
            </motion.div>
          </div>

          {/* Category Badge */}
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1 bg-[var(--theme-accent)] text-white text-xs font-medium rounded-full">
              {vlog.category}
            </span>
          </div>

          {/* Featured Badge */}
          {featured && (
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 bg-yellow-500 text-black text-xs font-medium rounded-full flex items-center space-x-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span>Featured</span>
              </span>
            </div>
          )}

          {/* Duration Badge */}
          {vlog.duration && (
            <div className="absolute bottom-4 right-4 px-2 py-1 bg-black/70 text-white text-xs rounded">
              {vlog.duration}
            </div>
          )}

          {/* Action Buttons */}
          <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <motion.button
              onClick={handleLike}
              disabled={isLiking}
              title={!isAuthenticated ? 'Login to interact' : isLiked ? 'Unlike' : 'Like'}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={isLiking ? { scale: [1, 1.1, 1] } : {}}
              transition={isLiking ? { repeat: Infinity, duration: 0.6 } : {}}
              className={`p-2.5 rounded-full transition-all duration-300 ${isLiked
                ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30'
                : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border border-white/20'
                } ${isLiking ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={!isLiked ? {
                backdropFilter: 'blur(12px) saturate(180%)',
                WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              } : {}}
            >
              {isLiked ? (
                <HeartIconSolid className="w-4 h-4" />
              ) : (
                <HeartIcon className="w-4 h-4" />
              )}
            </motion.button>

            <motion.button
              onClick={handleDislike}
              disabled={isDisliking}
              title={!isAuthenticated ? 'Login to interact' : isDisliked ? 'Remove dislike' : 'Dislike'}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={isDisliking ? { scale: [1, 1.1, 1] } : {}}
              transition={isDisliking ? { repeat: Infinity, duration: 0.6 } : {}}
              className={`p-2.5 rounded-full transition-all duration-300 ${isDisliked
                ? 'bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] text-white shadow-lg'
                : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border border-white/20'
                } ${isDisliking ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={!isDisliked ? {
                backdropFilter: 'blur(12px) saturate(180%)',
                WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              } : {}}
            >
              {isDisliked ? (
                <HandThumbDownIconSolid className="w-4 h-4" />
              ) : (
                <HandThumbDownIcon className="w-4 h-4" />
              )}
            </motion.button>

            <motion.button
              onClick={handleBookmark}
              disabled={isBookmarking}
              title={!isAuthenticated ? 'Login to interact' : isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              animate={isBookmarking ? { scale: [1, 1.1, 1] } : {}}
              transition={isBookmarking ? { repeat: Infinity, duration: 0.6 } : {}}
              className={`p-2.5 rounded-full transition-all duration-300 ${isBookmarked
                ? 'bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] text-white shadow-lg'
                : 'bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border border-white/20'
                } ${isBookmarking ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={!isBookmarked ? {
                backdropFilter: 'blur(12px) saturate(180%)',
                WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              } : {}}
            >
              {isBookmarked ? (
                <BookmarkIconSolid className="w-4 h-4" />
              ) : (
                <BookmarkIcon className="w-4 h-4" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6">
          {/* Author Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] flex items-center justify-center">
                {vlog.author?.avatar ? (
                  <img
                    src={vlog.author.avatar}
                    alt={vlog.author.username}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-white font-semibold text-sm">
                    {getInitials(vlog.author?.username)}
                  </span>
                )}
              </div>
              <div>
                <p
                  className="font-medium text-[var(--theme-text)] hover:text-[var(--theme-accent)] transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.location.href = `/profile/${vlog.author?.username}`
                  }}
                >
                  {vlog.author?.username}
                </p>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  {formatRelativeTime(vlog.createdAt)} • {formatNumber(vlog.author?.followerCount || 0)} followers
                </p>
              </div>
            </div>
            {vlog.author && user?._id !== vlog.author._id && (
              <FollowButton
                userId={vlog.author._id}
                username={vlog.author.username}
                className="text-xs px-3 py-1"
              />
            )}
          </div>

          {/* Title and Description */}
          <h3 className={`font-bold text-[var(--theme-text)] mb-2 ${featured ? 'text-2xl' : 'text-lg'
            }`}>
            {vlog.title}
          </h3>

          <p className="text-[var(--theme-text-secondary)] text-sm mb-4 line-clamp-2">
            {truncateText(vlog.description, featured ? 150 : 100)}
          </p>

          {/* Tags */}
          {vlog.tags && vlog.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {vlog.tags.slice(0, featured ? 4 : 3).map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-[var(--glass-white)] text-[var(--theme-text-secondary)] text-xs rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Stats and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-[var(--theme-text-secondary)]">
              <div className="flex items-center space-x-1">
                <EyeIcon className="w-4 h-4" />
                <motion.span
                  key={vlog.views}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {formatNumber(vlog.views || 0)}
                </motion.span>
              </div>

              <motion.button
                onClick={handleLike}
                disabled={isLiking}
                title={!isAuthenticated ? 'Login to interact' : isLiked ? 'Unlike' : 'Like'}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isLiking ? { scale: [1, 1.05, 1] } : {}}
                transition={isLiking ? { repeat: Infinity, duration: 0.6 } : {}}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-300 ${isLiked
                  ? 'bg-gradient-to-r from-red-500/20 to-pink-500/20 backdrop-blur-sm border border-red-500/30'
                  : 'hover:bg-white/5'
                  }`}
              >
                <motion.div
                  animate={isLiked ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isLiked ? (
                    <HeartIconSolid className="w-4 h-4 text-red-500" />
                  ) : (
                    <HeartIcon className="w-4 h-4 hover:text-red-500 transition-colors" />
                  )}
                </motion.div>
                <motion.span
                  key={likeCount}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={isLiked ? 'text-red-500 font-medium' : ''}
                >
                  {formatNumber(likeCount)}
                </motion.span>
              </motion.button>

              <motion.button
                onClick={handleDislike}
                disabled={isDisliking}
                title={!isAuthenticated ? 'Login to interact' : isDisliked ? 'Remove dislike' : 'Dislike'}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isDisliking ? { scale: [1, 1.05, 1] } : {}}
                transition={isDisliking ? { repeat: Infinity, duration: 0.6 } : {}}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-300 ${isDisliked
                  ? 'bg-gradient-to-r from-[var(--theme-accent)]/20 to-[var(--theme-secondary)]/20 backdrop-blur-sm border border-[var(--theme-accent)]/30'
                  : 'hover:bg-white/5'
                  }`}
              >
                <motion.div
                  animate={isDisliked ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isDisliked ? (
                    <HandThumbDownIconSolid className="w-4 h-4 text-[var(--theme-accent)]" />
                  ) : (
                    <HandThumbDownIcon className="w-4 h-4 hover:text-[var(--theme-accent)] transition-colors" />
                  )}
                </motion.div>
                <motion.span
                  key={dislikeCount}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={isDisliked ? 'text-[var(--theme-accent)] font-medium' : ''}
                >
                  {formatNumber(dislikeCount)}
                </motion.span>
              </motion.button>

              <div className="flex items-center space-x-1">
                <ChatBubbleLeftIcon className="w-4 h-4" />
                <motion.span
                  key={vlog.commentCount || vlog.comments?.length}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {formatNumber(vlog.commentCount || vlog.comments?.length || 0)}
                </motion.span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={!isAuthenticated ? 'Login to interact' : 'Share'}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<ShareIcon className="w-4 h-4" />}
                  onClick={handleShare}
                  disabled={isSharing}
                >
                  {isSharing ? 'Sharing...' : 'Share'}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export default VlogCard