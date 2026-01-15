import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../../contexts/ThemeContext'
import { PaintBrushIcon } from '@heroicons/react/24/outline'

const ThemeSelector = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, themes, changeTheme, currentTheme } = useTheme()

  const themeVariants = {
    hidden: { opacity: 0, scale: 0.8, y: -10 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.8, 
      y: -10,
      transition: {
        duration: 0.2
      }
    }
  }

  return (
    <div className="relative">
      {/* Theme Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg glass-hover focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
        aria-label="Select theme"
      >
        <PaintBrushIcon className="w-5 h-5" />
      </motion.button>

      {/* Theme Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-10"
            />

            {/* Theme Menu */}
            <motion.div
              variants={themeVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute top-full right-0 mt-2 w-64 glass-card border border-white/10 rounded-xl shadow-xl z-20"
            >
              <div className="p-4">
                <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
                  Choose Theme
                </h3>
                
                <div className="space-y-3">
                  {Object.entries(themes).map(([key, themeOption]) => (
                    <motion.button
                      key={key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        changeTheme(key)
                        setIsOpen(false)
                      }}
                      className={`
                        w-full p-3 rounded-lg border-2 transition-all duration-200
                        ${theme === key 
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/20' 
                          : 'border-transparent hover:border-[var(--theme-accent)]/50 hover:bg-[var(--glass-white)]'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        {/* Theme Preview */}
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${themeOption.gradient} shadow-lg`} />
                        
                        <div className="flex-1 text-left">
                          <h4 className="font-medium text-[var(--theme-text)]">
                            {themeOption.name}
                          </h4>
                          <p className="text-sm text-[var(--theme-text-secondary)]">
                            {themeOption.description}
                          </p>
                        </div>
                        
                        {/* Active Indicator */}
                        {theme === key && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-5 h-5 bg-[var(--theme-accent)] rounded-full flex items-center justify-center"
                          >
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Current Theme Info */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center space-x-2 text-sm text-[var(--theme-text-secondary)]">
                    <div className={`w-4 h-4 rounded bg-gradient-to-br ${currentTheme.gradient}`} />
                    <span>Current: {currentTheme.name}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ThemeSelector