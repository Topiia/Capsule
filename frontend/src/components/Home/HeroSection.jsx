
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Button from "../UI/Button";
import {
  SparklesIcon,
  RocketLaunchIcon,
  CameraIcon,
} from "@heroicons/react/24/outline";

/**
 * Responsive HeroSection
 * - Mobile-first sizes
 * - No fixed huge widths/heights
 * - Exports default component
 */

const HeroSection = () => {
  const { isAuthenticated } = useAuth?.() ?? { isAuthenticated: false };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Background Orbs (responsive sizes) */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 left-1/4 w-40 h-40 md:w-64 md:h-64 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -40, 0], y: [0, -30, 0], scale: [1, 0.9, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-1/4 right-1/4 w-32 h-32 md:w-48 md:h-48 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl"
        />

        <div
          className="absolute inset-0 opacity-8"
          style={{
            backgroundImage: `
              linear-gradient(var(--theme-accent)/10 1px, transparent 1px),
              linear-gradient(90deg, var(--theme-accent)/10 1px, transparent 1px)
            `,
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 mx-auto text-center max-w-2xl md:max-w-4xl">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center space-x-2 px-3 py-1 glass-card rounded-full mb-6"
        >
          <SparklesIcon className="w-4 h-4 text-[var(--theme-accent)]" />
          <span className="text-xs md:text-sm font-medium text-[var(--theme-text)]">
            AI-Powered Capsule Platform
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 leading-tight"
        >
          <span className="gradient-text">Share Your</span>
          <br />
          <span className="bg-gradient-to-r from-[var(--theme-accent)] via-[var(--theme-secondary)] to-[var(--theme-accent)] bg-clip-text text-transparent">
            Visual Story
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-base sm:text-lg md:text-xl text-[var(--theme-text-secondary)] mb-8 leading-relaxed px-2"
        >
          Create, share, and explore stunning AI-enhanced Capsules — where
          creativity meets futuristic design.
        </motion.p>

        {/* Feature Highlights */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-10">
          {[
            { icon: CameraIcon, text: "HD Uploads" },
            { icon: SparklesIcon, text: "AI Tagging" },
            { icon: RocketLaunchIcon, text: "Instant Publish" },
          ].map((f, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.03 }}
              className="flex items-center space-x-2 px-3 py-2 glass-card rounded-lg text-sm"
            >
              <f.icon className="w-4 h-4 text-[var(--theme-accent)]" />
              <span className="text-[var(--theme-text)]">{f.text}</span>
            </motion.div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          {isAuthenticated ? (
            <>
              <Link to="/create">
                <Button size="lg" variant="primary">
                  Create Capsule
                </Button>
              </Link>
              <Link to="/explore">
                <Button size="lg" variant="outline">
                  Explore Content
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg" variant="primary">
                  Start Creating Free
                </Button>
              </Link>
              <Link to="/explore">
                <Button size="lg" variant="outline">
                  Explore Platform
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-lg sm:max-w-4xl lg:max-w-6xl mx-auto">
          {[
            { number: "10K+", label: "Creators" },
            { number: "50K+", label: "Capsules" },
            { number: "1M+", label: "Views" },
            { number: "99.9%", label: "Uptime" },
          ].map((st, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.03 }}
              className="glass-card p-4 rounded-xl text-center"
            >
              <p className="text-xl md:text-2xl font-bold gradient-text mb-1">
                {st.number}
              </p>
              <p className="text-xs text-[var(--theme-text-secondary)]">
                {st.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ opacity: [0, 1] }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="flex flex-col items-center text-[var(--theme-text-secondary)]"
        >
          <span className="text-xs">Scroll to explore</span>
          <div className="w-5 h-8 border-2 border-[var(--theme-accent)] rounded-full flex justify-center">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.3 }}
              className="w-1 h-2 bg-[var(--theme-accent)] rounded-full mt-1"
            />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
