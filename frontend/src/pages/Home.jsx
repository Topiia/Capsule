import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { vlogAPI } from "../services/api";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import Button from "../components/UI/Button";
import HeroSection from "../components/Home/HeroSection";
import FeatureShowcase from "../components/Home/FeatureShowcase";
import StatsSection from "../components/Home/StatsSection";

const Home = () => {
  // Fetch featured vlogs
  const { data: featuredVlogs, isLoading: loadingFeatured } = useQuery({
    queryKey: ["featuredVlogs"],
    queryFn: () => vlogAPI.getVlogs({ limit: 6, sort: "popular" }),
    select: (response) => response.data.data,
  });

  // Fetch latest vlogs
  const { data: latestVlogs, isLoading: loadingLatest } = useQuery({
    queryKey: ["latestVlogs"],
    queryFn: () => vlogAPI.getVlogs({ limit: 8 }),
    select: (response) => response.data.data,
  });

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection />

      {/* Featured Vlogs Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
              Featured Content
            </h2>
            <p className="text-xl text-[var(--theme-text-secondary)] max-w-2xl mx-auto">
              Discover the most popular and trending capsules from our community of
              creators
            </p>
          </motion.div>

          {loadingFeatured ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="glass-card p-4 rounded-xl animate-pulse"
                >
                  <div className="h-48 bg-gray-600 rounded-lg mb-4"></div>
                  <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-600 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredVlogs?.map((vlog, index) => (
                <motion.div
                  key={vlog._id}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <CapsuleCard vlog={vlog} featured />
                </motion.div>
              ))}
            </div>
          )}

          <div className="text-center mt-12">
            <Link to="/explore">
              <Button size="lg" variant="outline">
                Explore More Content
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <FeatureShowcase />

      {/* Latest Vlogs Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
              Latest Capsules
            </h2>
            <p className="text-xl text-[var(--theme-text-secondary)] max-w-2xl mx-auto">
              Stay up to date with the newest content from our vibrant community
            </p>
          </motion.div>

          {loadingLatest ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="glass-card p-4 rounded-xl animate-pulse"
                >
                  <div className="h-32 bg-gray-600 rounded-lg mb-4"></div>
                  <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-600 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {latestVlogs?.map((vlog, index) => (
                <motion.div
                  key={vlog._id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                >
                  <CapsuleCard vlog={vlog} compact />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <StatsSection />

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="glass-card p-12 rounded-2xl text-center"
          >
            <h2 className="text-4xl md:text-5xl font-bold gradient-text mb-6">
              Ready to Share Your Story?
            </h2>
            <p className="text-xl text-[var(--theme-text-secondary)] mb-8 max-w-2xl mx-auto">
              Join thousands of creators who are already sharing their passion
              with the world. Start your capsule journey today with our
              AI-powered platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button size="lg" variant="primary">
                  Get Started Free
                </Button>
              </Link>
              <Link to="/create">
                <Button size="lg" variant="outline">
                  Create Your First Capsule
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Home;
