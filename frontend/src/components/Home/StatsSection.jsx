import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const StatsSection = () => {
  const [stats, setStats] = useState({
    users: 0,
    capsules: 0,
    views: 0,
    uptime: 0,
  });

  useEffect(() => {
    // Animate numbers on mount
    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;

    const targetStats = {
      users: 12500,
      capsules: 48500,
      views: 2400000,
      uptime: 99.9,
    };

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      setStats({
        users: Math.floor(targetStats.users * progress),
        capsules: Math.floor(targetStats.capsules * progress),
        views: Math.floor(targetStats.views * progress),
        uptime: Math.min(targetStats.uptime, 99.9 * progress),
      });

      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  const statItems = [
    {
      label: "Active Users",
      value: stats.users.toLocaleString(),
      icon: "👥",
      color: "from-blue-500 to-purple-500",
    },
    {
      label: "Capsules Created",
      value: stats.capsules.toLocaleString(),
      icon: "📹",
      color: "from-green-500 to-blue-500",
    },
    {
      label: "Total Views",
      value: `${(stats.views / 1000000).toFixed(1)}M`,
      icon: "👁️",
      color: "from-orange-500 to-red-500",
    },
    {
      label: "Uptime",
      value: `${stats.uptime.toFixed(1)}%`,
      icon: "⚡",
      color: "from-purple-500 to-pink-500",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
      },
    },
  };

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-6">
            Platform Statistics
          </h2>
          <p className="text-xl text-[var(--theme-text-secondary)] max-w-2xl mx-auto">
            Join thousands of creators who trust CAPSULE for their visual
            storytelling
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {statItems.map((stat, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{
                scale: 1.05,
                transition: { type: "spring", stiffness: 300 },
              }}
              className="glass-card p-8 rounded-2xl text-center group"
            >
              <div
                className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-r ${stat.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
              >
                <span className="text-2xl">{stat.icon}</span>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="text-3xl md:text-4xl font-bold gradient-text mb-2"
              >
                {stat.value}
              </motion.div>

              <p className="text-[var(--theme-text-secondary)] font-medium">
                {stat.label}
              </p>

              <div className="mt-4">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-[var(--theme-accent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Performance Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-20 glass-card p-8 rounded-2xl"
        >
          <h3 className="text-2xl font-bold text-[var(--theme-text)] mb-8 text-center">
            Performance Metrics
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">⚡</span>
              </div>
              <h4 className="text-lg font-semibold text-[var(--theme-text)] mb-2">
                Lightning Fast
              </h4>
              <p className="text-[var(--theme-text-secondary)]">
                Optimized performance with CDN delivery and efficient caching
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">🔒</span>
              </div>
              <h4 className="text-lg font-semibold text-[var(--theme-text)] mb-2">
                Secure & Private
              </h4>
              <p className="text-[var(--theme-text-secondary)]">
                Enterprise-grade security with encrypted data and secure
                authentication
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">📱</span>
              </div>
              <h4 className="text-lg font-semibold text-[var(--theme-text)] mb-2">
                Fully Responsive
              </h4>
              <p className="text-[var(--theme-text-secondary)]">
                Perfect experience on desktop, tablet, and mobile devices
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default StatsSection;
