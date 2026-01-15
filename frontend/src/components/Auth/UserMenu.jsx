import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { getInitials } from '../../utils/helpers'
import {
  UserIcon,
  Cog6ToothIcon,
  BookmarkIcon,
  HeartIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'

const UserMenu = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()

  const menuItems = [
    {
      label: 'My Profile',
      href: `/profile/${user?.username}`,
      icon: UserIcon,
      action: () => navigate(`/profile/${user?.username}`)
    },
    {
      label: 'Create Vlog',
      href: '/create',
      icon: PlusIcon,
      action: () => navigate('/create')
    },
    {
      label: 'Bookmarks',
      href: '/bookmarks',
      icon: BookmarkIcon,
      action: () => navigate('/bookmarks')
    },
    {
      label: 'Liked Vlogs',
      href: '/liked',
      icon: HeartIcon,
      action: () => navigate('/liked')
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Cog6ToothIcon,
      action: () => navigate('/settings')
    },
  ]

  const handleLogout = async () => {
    await logout()
    setIsOpen(false)
  }

  return (
    <div className="relative">
      {/* User Menu Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg glass-hover focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] flex items-center justify-center">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-white font-semibold text-sm">
              {getInitials(user?.username)}
            </span>
          )}
        </div>
        
        {/* Username and Dropdown Icon */}
        <div className="hidden md:flex items-center space-x-1">
          <span className="text-sm font-medium text-[var(--theme-text)]">
            {user?.username}
          </span>
          <ChevronDownIcon className={`w-4 h-4 text-[var(--theme-text-secondary)] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} />
        </div>
      </motion.button>

      {/* Dropdown Menu */}
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

            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute top-full right-0 mt-2 w-64 glass-card border border-white/10 rounded-xl shadow-xl z-20"
            >
              {/* User Info Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] flex items-center justify-center">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.username}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-bold text-lg">
                        {getInitials(user?.username)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--theme-text)]">{user?.username}</h3>
                    <p className="text-sm text-[var(--theme-text-secondary)]">
                      {user?.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-2">
                {menuItems.map((item, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      item.action()
                      setIsOpen(false)
                    }}
                    className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--glass-white)] transition-all duration-200"
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-white/10"></div>

              {/* Logout Button */}
              <div className="p-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all duration-200"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  <span>Logout</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default UserMenu