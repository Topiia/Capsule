import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import SearchBar from "../Search/SearchBar";
import ThemeSelector from "../Theme/ThemeSelector";
import UserMenu from "../Auth/UserMenu";
import MobileMenu from "./MobileMenu";
import Logo from "../UI/Logo";
import {
  Bars3Icon,
  XMarkIcon,
  PlusIcon,
  HomeIcon,
  MapIcon,
  FireIcon,
  UserIcon,
  BookmarkIcon,
  HeartIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

const Header = ({ onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navigation = [
    { name: "Home", href: "/", icon: HomeIcon },
    { name: "Explore", href: "/explore", icon: MapIcon },
    { name: "Trending", href: "/trending", icon: FireIcon },
  ];

  if (isAuthenticated) {
    navigation.push(
      { name: "Dashboard", href: "/dashboard", icon: UserIcon },
      { name: "Bookmarks", href: "/bookmarks", icon: BookmarkIcon },
      { name: "Liked", href: "/liked", icon: HeartIcon },
      { name: "Settings", href: "/settings", icon: Cog6ToothIcon },
    );
  }

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "glass shadow-lg backdrop-blur-xl"
            : "glass backdrop-blur-md"
        }`}
      >
        <div className="max-w-full px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left Section: Logo and Mobile Menu Toggle */}
            <div className="flex items-center space-x-3 min-w-0 flex-shrink-0">
              {isAuthenticated && (
                <button
                  onClick={onToggleSidebar}
                  className="lg:hidden p-2 rounded-lg glass-hover focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                  aria-label="Toggle sidebar"
                >
                  <Bars3Icon className="w-6 h-6 text-[var(--theme-text)]" />
                </button>
              )}

              <Link
                to="/"
                className="flex items-center space-x-2 flex-shrink-0"
              >
                <Logo size="sm" />
                <span className="hidden sm:block text-xl font-bold gradient-text whitespace-nowrap">
                  CAPSULE
                </span>
              </Link>
            </div>

            {/* Center: Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-6 flex-1 justify-center max-w-2xl mx-4">
              {navigation.slice(0, 3).map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`relative px-3 py-2 rounded-lg transition-all duration-200 whitespace-nowrap ${
                    location.pathname === item.href
                      ? "text-[var(--theme-accent)] bg-[var(--glass-white)]"
                      : "text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--glass-white)]"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <item.icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </span>

                  {location.pathname === item.href && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--theme-accent)] rounded-full"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </Link>
              ))}
            </nav>

            {/* Right Section: Actions */}
            <div className="flex items-center space-x-2 lg:space-x-3 flex-shrink-0">
              {/* Search Bar */}
              <div className="hidden xl:block">
                <SearchBar />
              </div>

              {/* Create Button */}
              {isAuthenticated && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/create")}
                  className="hidden md:flex items-center space-x-2 px-3 lg:px-4 py-2 bg-[var(--theme-accent)] text-white rounded-lg hover:shadow-lg transition-all duration-200"
                  aria-label="Create new capsule"
                >
                  <PlusIcon className="w-5 h-5" />
                  <span className="hidden lg:inline">Create</span>
                </motion.button>
              )}

              {/* Theme Selector */}
              <div className="hidden sm:block">
                <ThemeSelector />
              </div>

              {/* User Menu or Auth Buttons */}
              {isAuthenticated ? (
                <UserMenu user={user} />
              ) : (
                <div className="hidden md:flex items-center space-x-2">
                  <Link
                    to="/login"
                    className="px-3 lg:px-4 py-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors whitespace-nowrap"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="px-3 lg:px-4 py-2 bg-[var(--theme-accent)] text-white rounded-lg hover:shadow-lg transition-all duration-200 whitespace-nowrap"
                  >
                    Sign Up
                  </Link>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg glass-hover focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6 text-[var(--theme-text)]" />
                ) : (
                  <Bars3Icon className="w-6 h-6 text-[var(--theme-text)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navigation={navigation}
      />
    </>
  );
};

export default Header;
