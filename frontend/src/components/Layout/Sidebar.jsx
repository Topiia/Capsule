import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import Logo from "../UI/Logo";
import {
  HomeIcon,
  MapIcon,
  FireIcon,
  UserIcon,
  PlusIcon,
  BookmarkIcon,
  HeartIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { name: "Home", href: "/", icon: HomeIcon },
    { name: "Explore", href: "/explore", icon: MapIcon },
    { name: "Trending", href: "/trending", icon: FireIcon },
    { name: "Create Capsule", href: "/create", icon: PlusIcon },
    { name: "My Profile", href: `/profile/${user?.username}`, icon: UserIcon },
    { name: "Bookmarks", href: "/bookmarks", icon: BookmarkIcon },
    { name: "Liked", href: "/liked", icon: HeartIcon },
    { name: "Settings", href: "/settings", icon: Cog6ToothIcon },
  ];

  return (
    <>
      {/* Mobile Overlay - Below header (z-30) */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
        />
      )}

      {/* Sidebar - Mobile: Fixed with animation, Desktop: Sticky */}
      <aside
        className={`
          fixed lg:fixed top-0 left-0 h-screen w-64 
          glass-card border-r border-white/10 z-40 lg:z-10
          transition-transform duration-300 ease-in-out
          overflow-y-auto overflow-x-hidden lg:self-start
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="flex flex-col h-full pt-16">
          {/* Header - Hidden on desktop to avoid duplication */}
          <div className="p-6 border-b border-white/10 lg:hidden">
            <div className="flex items-center space-x-3">
              <Logo size="md" />
              <div>
                <h2 className="text-lg font-bold text-[var(--theme-text)]">
                  CAPSULE
                </h2>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  Create & Share
                </p>
              </div>
            </div>
          </div>

          {/* User Profile */}
          {user && (
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[var(--theme-accent)] to-[var(--theme-secondary)] flex items-center justify-center">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-bold text-lg">
                      {user.username?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--theme-text)]">
                    {user.username}
                  </h3>
                  <p className="text-sm text-[var(--theme-text-secondary)]">
                    {user.followerCount || 0} followers
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {menuItems.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={onClose}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      location.pathname === item.href
                        ? "bg-[var(--theme-accent)] text-white shadow-lg"
                        : "text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--glass-white)]"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer Actions */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="flex items-center space-x-3 w-full px-4 py-3 rounded-lg text-red-400 hover:bg-red-400/10 hover:text-red-300 transition-all duration-200"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
