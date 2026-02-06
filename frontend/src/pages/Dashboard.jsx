import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { vlogAPI } from "../services/api";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import Button from "../components/UI/Button";
import {
  PlusIcon,
  ChartBarIcon,
  UserIcon,
  EyeIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";

const Dashboard = () => {
  const { user } = useAuth();

  // Fetch user's vlogs
  const { data: userVlogs, isLoading: loadingVlogs } = useQuery({
    queryKey: ["userVlogs", user?.id],
    queryFn: () => vlogAPI.getUserVlogs(user?.id, { limit: 6 }),
    select: (response) => response.data.data,
    enabled: !!user?.id,
  });

  // Fetch analytics data
  const { data: analytics } = useQuery({
    queryKey: ["analytics", user?.id],
    queryFn: () => vlogAPI.getUserVlogs(user?.id, { limit: 100 }),
    select: (response) => {
      const vlogs = response.data.data;
      const totalViews = vlogs.reduce(
        (sum, vlog) => sum + (vlog.views || 0),
        0,
      );
      const totalLikes = vlogs.reduce(
        (sum, vlog) => sum + (vlog.likeCount || 0),
        0,
      );
      const totalComments = vlogs.reduce(
        (sum, vlog) => sum + (vlog.commentCount || 0),
        0,
      );

      return {
        totalVlogs: vlogs.length,
        totalViews,
        totalLikes,
        totalComments,
      };
    },
    enabled: !!user?.id,
  });

  const stats = [
    {
      name: "Total Vlogs",
      value: analytics?.totalVlogs || 0,
      icon: ChartBarIcon,
      color: "text-blue-400",
    },
    {
      name: "Total Views",
      value: analytics?.totalViews || 0,
      icon: EyeIcon,
      color: "text-green-400",
    },
    {
      name: "Total Likes",
      value: analytics?.totalLikes || 0,
      icon: HeartIcon,
      color: "text-red-400",
    },
    {
      name: "Total Comments",
      value: analytics?.totalComments || 0,
      icon: ChatBubbleLeftIcon,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">
              Welcome back, {user?.username}!
            </h1>
            <p className="text-[var(--theme-text-secondary)]">
              Here&apos;s what&apos;s happening with your content today
            </p>
          </div>

          <div className="mt-4 sm:mt-0 flex space-x-3">
            <Link to="/create">
              <Button
                variant="primary"
                leftIcon={<PlusIcon className="w-5 h-5" />}
              >
                Create Capsule
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
      >
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            whileHover={{ scale: 1.05 }}
            className="glass-card p-6 rounded-xl text-center"
          >
            <div
              className={`inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--glass-white)] mb-4`}
            >
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-[var(--theme-text)] mb-1">
              {stat.value.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--theme-text-secondary)]">
              {stat.name}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Vlogs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6 rounded-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[var(--theme-text)]">
            Your Recent Vlogs
          </h2>
          <Link to="/profile">
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {loadingVlogs ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-gray-600 rounded-xl mb-4"></div>
                <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : userVlogs && userVlogs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userVlogs.map((vlog, index) => (
              <motion.div
                key={vlog._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <CapsuleCard vlog={vlog} compact />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--glass-white)] flex items-center justify-center">
              <ChartBarIcon className="w-8 h-8 text-[var(--theme-text-secondary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--theme-text)] mb-2">
              No vlogs yet
            </h3>
            <p className="text-[var(--theme-text-secondary)] mb-6">
              Start creating content to see your stats and vlogs here
            </p>
            <Link to="/create">
              <Button
                variant="primary"
                leftIcon={<PlusIcon className="w-5 h-5" />}
              >
                Create Your First Vlog
              </Button>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <div className="glass-card p-6 rounded-xl text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-[var(--theme-text)] mb-2">
            Profile Settings
          </h3>
          <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
            Customize your profile and preferences
          </p>
          <Link to="/settings">
            <Button variant="outline" size="sm">
              Manage Profile
            </Button>
          </Link>
        </div>

        <div className="glass-card p-6 rounded-xl text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center">
            <ChartBarIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-[var(--theme-text)] mb-2">
            Analytics
          </h3>
          <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
            View detailed insights about your content
          </p>
          <Button variant="outline" size="sm">
            View Analytics
          </Button>
        </div>

        <div className="glass-card p-6 rounded-xl text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
            <PlusIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-[var(--theme-text)] mb-2">
            Create Content
          </h3>
          <p className="text-sm text-[var(--theme-text-secondary)] mb-4">
            Start creating and sharing your vlogs
          </p>
          <Link to="/create">
            <Button variant="outline" size="sm">
              Create Vlog
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
