import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { vlogAPI } from '../services/api'
import VlogCard from '../components/Vlog/VlogCard'

import { FireIcon, TrophyIcon, ArrowTrendingUpIcon, UserIcon } from '@heroicons/react/24/outline'

const Trending = () => {
  // Fetch trending vlogs
  const { data: trendingVlogs, isLoading } = useQuery({
    queryKey: ['trendingVlogs'],
    queryFn: () => vlogAPI.getTrending({ limit: 20 }),
    select: (response) => response.data
  })

  const timeFrames = [
    { label: 'Today', value: 'today', active: true },
    { label: 'This Week', value: 'week', active: false },
    { label: 'This Month', value: 'month', active: false },
    { label: 'All Time', value: 'all', active: false }
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
            <FireIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-bold gradient-text">
              Trending
            </h1>
            <p className="text-[var(--theme-text-secondary)]">
              The most popular content right now
            </p>
          </div>
        </div>

        {/* Time Frame Selector */}
        <div className="flex flex-wrap gap-2">
          {timeFrames.map((frame) => (
            <button
              key={frame.value}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${frame.active
                  ? 'bg-[var(--theme-accent)] text-white'
                  : 'glass-hover text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                }`}
            >
              {frame.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Trending Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-12"
      >
        <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6 flex items-center">
          <ArrowTrendingUpIcon className="w-6 h-6 mr-2 text-[var(--theme-accent)]" />
          Hot Right Now
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-64 bg-gray-600 rounded-xl mb-4"></div>
                <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trendingVlogs?.data?.slice(0, 3).map((vlog, index) => (
              <motion.div
                key={vlog._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="relative"
              >
                {/* Trending Badge */}
                <div className="absolute top-4 left-4 z-10">
                  <div className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold rounded-full">
                    <TrophyIcon className="w-4 h-4" />
                    <span>#{index + 1}</span>
                  </div>
                </div>
                <VlogCard vlog={vlog} featured />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* All Trending Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6">
          All Trending Content
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-gray-600 rounded-xl mb-4"></div>
                <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {trendingVlogs?.data?.slice(3).map((vlog, index) => (
              <motion.div
                key={vlog._id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.05 }}
              >
                <VlogCard vlog={vlog} compact />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Stats Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-16 glass-card p-8 rounded-2xl"
      >
        <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-6 text-center">
          Platform Stats
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Views Today', value: '2.4M', icon: FireIcon },
            { label: 'New Vlogs', value: '1.2K', icon: ArrowTrendingUpIcon },
            { label: 'Active Creators', value: '8.5K', icon: UserIcon },
            { label: 'Engagement Rate', value: '94%', icon: TrophyIcon }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 + index * 0.1 }}
              className="text-center"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[var(--glass-white)] flex items-center justify-center">
                <stat.icon className="w-6 h-6 text-[var(--theme-accent)]" />
              </div>
              <div className="text-2xl font-bold gradient-text mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-[var(--theme-text-secondary)]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

export default Trending