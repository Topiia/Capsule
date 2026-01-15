import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'

const Toast = ({ id, message, type = 'info', duration = 3000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  const typeConfig = {
    success: {
      icon: CheckCircleIcon,
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/50',
      iconColor: 'text-green-400',
      textColor: 'text-green-100'
    },
    error: {
      icon: ExclamationCircleIcon,
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/50',
      iconColor: 'text-red-400',
      textColor: 'text-red-100'
    },
    warning: {
      icon: ExclamationTriangleIcon,
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/50',
      iconColor: 'text-yellow-400',
      textColor: 'text-yellow-100'
    },
    info: {
      icon: InformationCircleIcon,
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/50',
      iconColor: 'text-blue-400',
      textColor: 'text-blue-100'
    }
  }

  const config = typeConfig[type] || typeConfig.info
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`
        relative flex items-center gap-3 p-4 rounded-xl
        backdrop-blur-md bg-white/10 border border-white/20
        shadow-lg shadow-black/30
        min-w-[300px] max-w-[500px]
      `}
      style={{
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      }}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 ${config.iconColor}`}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Message */}
      <div className={`flex-1 ${config.textColor} text-sm font-medium`}>
        {message}
      </div>

      {/* Close Button */}
      <button
        onClick={() => onClose(id)}
        className={`
          flex-shrink-0 ${config.iconColor} hover:opacity-70
          transition-opacity duration-200
        `}
        aria-label="Close notification"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>

      {/* Progress Bar */}
      {duration > 0 && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className={`
            absolute bottom-0 left-0 right-0 h-1 rounded-b-lg
            ${config.iconColor.replace('text-', 'bg-')}
            origin-left
          `}
        />
      )}
    </motion.div>
  )
}

export default Toast
