import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import Button from './Button'
import { 
  ExclamationTriangleIcon, 
  XMarkIcon, 
  InformationCircleIcon,
  ExclamationCircleIcon 
} from '@heroicons/react/24/outline'

const DeleteConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isLoading = false,
  type = 'danger' // 'danger', 'warning', 'info'
}) => {
  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, isLoading, onClose])

  // Type configurations
  const typeConfig = {
    danger: {
      icon: ExclamationTriangleIcon,
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-500',
      buttonVariant: 'danger',
      buttonClass: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
    },
    warning: {
      icon: ExclamationCircleIcon,
      iconBg: 'bg-yellow-500/20',
      iconColor: 'text-yellow-500',
      buttonVariant: 'primary',
      buttonClass: 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600'
    },
    info: {
      icon: InformationCircleIcon,
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
      buttonVariant: 'primary',
      buttonClass: 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600'
    }
  }

  const config = typeConfig[type] || typeConfig.danger
  const IconComponent = config.icon

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={!isLoading ? onClose : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ 
                type: "spring", 
                damping: 25, 
                stiffness: 300,
                duration: 0.3 
              }}
              className="glass-card p-6 rounded-2xl max-w-md w-full relative shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              aria-describedby="modal-description"
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg glass-hover text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
                disabled={isLoading}
                aria-label="Close modal"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>

              {/* Icon with animation */}
              <motion.div 
                className="flex justify-center mb-4"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              >
                <div className={`w-16 h-16 rounded-full ${config.iconBg} flex items-center justify-center`}>
                  <IconComponent className={`w-8 h-8 ${config.iconColor}`} />
                </div>
              </motion.div>

              {/* Title */}
              <motion.h2 
                id="modal-title"
                className="text-2xl font-bold text-[var(--theme-text)] text-center mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                {title || 'Confirm Action'}
              </motion.h2>

              {/* Message */}
              <motion.p 
                id="modal-description"
                className="text-[var(--theme-text-secondary)] text-center mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {message || 'Are you sure you want to proceed? This action cannot be undone.'}
              </motion.p>

              {/* Actions */}
              <motion.div 
                className="flex space-x-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={onClose}
                  disabled={isLoading}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={config.buttonVariant}
                  size="lg"
                  fullWidth
                  onClick={onConfirm}
                  loading={isLoading}
                  className={config.buttonClass}
                >
                  {confirmText}
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

export default DeleteConfirmModal
