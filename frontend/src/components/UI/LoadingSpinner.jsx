import { motion } from 'framer-motion'

const LoadingSpinner = ({ size = 'md', className = '', text = '' }) => {
  const sizes = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const dotVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 15
      }
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`flex flex-col items-center justify-center ${className}`}
    >
      {/* Futuristic Spinner Design */}
      <div className="relative">
        {/* Outer Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className={`absolute inset-0 ${sizes[size]} border-2 border-transparent border-t-[var(--theme-accent)] rounded-full`}
        />
        
        {/* Inner Ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className={`absolute inset-2 ${sizes[size]} border-2 border-transparent border-b-[var(--theme-secondary)] rounded-full`}
        />
        
        {/* Center Dot */}
        <div className={`absolute inset-0 flex items-center justify-center ${sizes[size]}`}>
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [1, 0.6, 1]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-2 h-2 bg-[var(--theme-accent)] rounded-full shadow-lg shadow-[var(--theme-accent)]/50"
          />
        </div>

        {/* Orbiting Particles */}
        {[0, 120, 240].map((rotation, index) => (
          <motion.div
            key={index}
            animate={{ 
              rotate: rotation,
              scale: [1, 1.5, 1],
              opacity: [0.6, 1, 0.6]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.2
            }}
            className="absolute inset-0"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[var(--theme-secondary)] rounded-full" />
          </motion.div>
        ))}
      </div>

      {/* Loading Text */}
      {text && (
        <motion.p
          variants={dotVariants}
          className="mt-4 text-[var(--theme-text-secondary)] text-sm font-medium"
        >
          {text}
        </motion.p>
      )}

      {/* Animated Dots */}
      {!text && (
        <motion.div
          variants={dotVariants}
          className="mt-4 flex space-x-1"
        >
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.6, 1, 0.6]
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.2
              }}
              className="w-2 h-2 bg-[var(--theme-accent)] rounded-full"
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}

// Skeleton Loading Component
export const SkeletonLoader = ({ className = '', count = 1 }) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.1 }}
          className="glass-card p-4 rounded-xl"
        >
          <div className="animate-pulse">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gray-600 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-600 rounded w-1/4"></div>
                <div className="h-3 bg-gray-600 rounded w-1/6"></div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-4 bg-gray-600 rounded w-3/4"></div>
              <div className="h-4 bg-gray-600 rounded w-1/2"></div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Page Loading Component
export const PageLoader = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <LoadingSpinner size="xl" text="Loading VLOGSPHERE..." />
    </div>
  )
}

export default LoadingSpinner