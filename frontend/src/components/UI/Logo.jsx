import { motion } from "framer-motion";

const Logo = ({ size = "md", className = "" }) => {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  return (
    <motion.div
      whileHover={{ rotate: 360, scale: 1.1 }}
      transition={{ duration: 0.5, type: "spring" }}
      className={`${sizes[size]} ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Circle with Gradient */}
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-accent)" />
            <stop offset="100%" stopColor="var(--theme-secondary)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="url(#logoGradient)"
          strokeWidth="4"
          filter="url(#glow)"
        />

        {/* Inner Capsule Shape */}
        <rect
          x="35"
          y="25"
          width="30"
          height="50"
          rx="15"
          fill="url(#logoGradient)"
          opacity="0.8"
        />

        {/* Decorative Elements */}
        <circle
          cx="25"
          cy="25"
          r="3"
          fill="var(--theme-accent)"
          opacity="0.6"
        />
        <circle
          cx="75"
          cy="75"
          r="2"
          fill="var(--theme-secondary)"
          opacity="0.6"
        />

        {/* Circuit-like Pattern */}
        <path
          d="M20 50 Q50 20 80 50 Q50 80 20 50"
          stroke="var(--theme-accent)"
          strokeWidth="1"
          fill="none"
          opacity="0.3"
        />
      </svg>
    </motion.div>
  );
};

export default Logo;
