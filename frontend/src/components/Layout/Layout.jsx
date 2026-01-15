import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import Header from './Header'
import Footer from './Footer'
import Sidebar from './Sidebar'
import BackgroundAnimation from '../UI/BackgroundAnimation'
import { useAuth } from '../../contexts/AuthContext'
import { useState } from 'react'

const Layout = () => {
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen relative">
      {/* Optimized Background Animation */}
      <BackgroundAnimation 
        brightness={0.6} 
        opacity={0.35} 
        intensity="medium" 
      />

      {/* Main Content Container - z-10 ensures it's above background */}
      <div className="relative z-10">
        {/* Header - Fixed at top with proper z-index */}
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        
        {/* Content Area with Sidebar */}
        <div className="flex items-start pt-16">
          {/* Sidebar - Only shown when authenticated */}
          {isAuthenticated && (
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          )}

          {/* Main Content - Flexible width, proper spacing */}
          <main className="flex-1 min-h-screen w-full">
            <div className="container mx-auto px-4 py-8 max-w-7xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Outlet />
              </motion.div>
            </div>
          </main>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  )
}

export default Layout