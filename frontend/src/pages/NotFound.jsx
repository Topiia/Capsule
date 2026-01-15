import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Button from '../components/UI/Button'
import Logo from '../components/UI/Logo'

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 15
        }}
        className="text-center max-w-lg mx-auto"
      >
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Logo size="xl" />
        </div>

        {/* 404 Text */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-6xl md:text-8xl font-bold gradient-text mb-4"
        >
          404
        </motion.h1>

        {/* Main Message */}
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl md:text-3xl font-semibold text-[var(--theme-text)] mb-4"
        >
          Page Not Found
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-[var(--theme-text-secondary)] text-lg mb-8"
        >
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link to="/">
            <Button
              size="lg"
              variant="primary"
              className="w-full sm:w-auto"
            >
              Go Home
            </Button>
          </Link>
          
          <Link to="/explore">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              Explore Content
            </Button>
          </Link>
        </motion.div>

        {/* Decorative Elements */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 flex justify-center space-x-2"
        >
          <div className="w-2 h-2 bg-[var(--theme-accent)] rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-[var(--theme-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-[var(--theme-accent)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </motion.div>

        {/* Error Code */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-[var(--theme-text-secondary)]">
            Error Code: <span className="font-mono">404_NOT_FOUND</span>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default NotFound