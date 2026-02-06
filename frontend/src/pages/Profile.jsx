import { motion } from "framer-motion";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { userAPI, vlogAPI } from "../services/api";
import { formatNumber, getInitials } from "../utils/helpers";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import Button from "../components/UI/Button";
import FollowButton from "../components/UI/FollowButton";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import {
  UserIcon,
  CalendarIcon,
  ShareIcon,
  MapPinIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

const Profile = () => {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const isOwnProfile = currentUser?.username === username;

  // Fetch user profile
  const {
    data: profileUser,
    isLoading: loadingProfile,
    error: profileError,
  } = useQuery({
    queryKey: ["userProfile", username],
    queryFn: () => userAPI.getUserByUsername(username),
    select: (response) => response.data.data,
    retry: false,
  });

  // Fetch user's vlogs
  const { data: userVlogs, isLoading: loadingVlogs } = useQuery({
    queryKey: ["userVlogs", profileUser?._id],
    queryFn: () => vlogAPI.getUserVlogs(profileUser?._id, { limit: 12 }),
    select: (response) => response.data,
    enabled: !!profileUser?._id,
  });

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (profileError || !profileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--theme-text)] mb-2">
            User Not Found
          </h1>
          <p className="text-[var(--theme-text-secondary)]">
            The profile you&apos;re looking for doesn&apos;t exist
          </p>
          <Link to="/explore" className="mt-4 inline-block">
            <Button variant="primary">Explore Capsules</Button>
          </Link>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Capsules", value: userVlogs?.total || 0 },
    { label: "Followers", value: profileUser.followerCount || 0 },
    { label: "Following", value: profileUser.followingCount || 0 },
    {
      label: "Total Views",
      value: formatNumber(
        userVlogs?.data?.reduce((sum, vlog) => sum + (vlog.views || 0), 0) || 0,
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 rounded-2xl mb-8"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-8">
          {/* Avatar */}
          <div className="flex-shrink-0 mb-6 lg:mb-0">
            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] flex items-center justify-center">
              {profileUser.avatar ? (
                <img
                  src={profileUser.avatar}
                  alt={profileUser.username}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white font-bold text-4xl">
                  {getInitials(profileUser.username)}
                </span>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-[var(--theme-text)] mb-1">
                  {profileUser.username}
                </h1>
                {profileUser.bio && (
                  <p className="text-[var(--theme-text-secondary)] mb-2">
                    {profileUser.bio}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--theme-text-secondary)]">
                  <div className="flex items-center space-x-1">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      Joined{" "}
                      {new Date(profileUser.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {profileUser.location && (
                    <div className="flex items-center space-x-1">
                      <MapPinIcon className="w-4 h-4" />
                      <span>{profileUser.location}</span>
                    </div>
                  )}
                  {profileUser.website && (
                    <div className="flex items-center space-x-1">
                      <LinkIcon className="w-4 h-4" />
                      <a
                        href={profileUser.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--theme-accent)] hover:underline"
                      >
                        Website
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 sm:mt-0 flex space-x-3">
                {isOwnProfile ? (
                  <Button
                    variant="outline"
                    leftIcon={<UserIcon className="w-5 h-5" />}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    <FollowButton
                      userId={profileUser._id}
                      username={profileUser.username}
                    />
                    <Button variant="outline">Message</Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  leftIcon={<ShareIcon className="w-5 h-5" />}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="text-center glass-card p-4 rounded-xl"
                >
                  <div className="text-2xl font-bold text-[var(--theme-text)] mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Content Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <div className="border-b border-white/10">
          <nav className="-mb-px flex space-x-8">
            {[
              { label: "Capsules", value: "vlogs" },
              { label: "About", value: "about" },
              { label: "Following", value: "following" },
              { label: "Followers", value: "followers" },
            ].map((tab) => (
              <button
                key={tab.value}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  tab.value === "vlogs"
                    ? "border-[var(--theme-accent)] text-[var(--theme-accent)]"
                    : "border-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:border-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </motion.div>

      {/* Vlogs Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {loadingVlogs ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-64 bg-gray-600 rounded-xl mb-4"></div>
                <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : userVlogs && userVlogs.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userVlogs.data.map((vlog, index) => (
              <motion.div
                key={vlog._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <CapsuleCard vlog={vlog} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
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
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-[var(--theme-text)] mb-2">
              No capsules yet
            </h3>
            <p className="text-[var(--theme-text-secondary)] mb-6">
              {isOwnProfile
                ? "Start creating content to share your story with the world"
                : `${profileUser.username} hasn't created any capsules yet`}
            </p>
            {isOwnProfile && (
              <Link to="/create">
                <Button
                  variant="primary"
                  leftIcon={
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  }
                >
                  Create Your First Capsule
                </Button>
              </Link>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Profile;
