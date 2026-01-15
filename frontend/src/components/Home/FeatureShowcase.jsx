import { motion } from 'framer-motion'
import {
  CpuChipIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  CloudArrowUpIcon,
  MagnifyingGlassIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'

const FeatureShowcase = () => {
  const features = [
    {
      icon: CpuChipIcon,
      title: 'AI-Powered Features',
      description: 'Automatic tagging, content analysis, and smart recommendations powered by advanced machine learning algorithms.',
      color: 'from-purple-500 to-pink-500'
    },
    {
      icon: PaintBrushIcon,
      title: 'Futuristic Design',
      description: 'Three premium gradient themes with glass morphism effects, smooth animations, and responsive layouts.',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: ShieldCheckIcon,
      title: 'Advanced Security',
      description: 'JWT authentication, rate limiting, input validation, and comprehensive security measures.',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: CloudArrowUpIcon,
      title: 'Media Management',
      description: 'Seamless image uploads with Cloudinary integration, automatic optimization, and CDN delivery.',
      color: 'from-orange-500 to-red-500'
    },
    {
      icon: MagnifyingGlassIcon,
      title: 'Smart Search',
      description: 'Full-text search, category filters, tags, and advanced discovery features with real-time results.',
      color: 'from-indigo-500 to-purple-500'
    },
    {
      icon: UserGroupIcon,
      title: 'Social Features',
      description: 'Follow system, likes, comments, shares, and engagement analytics for community building.',
      color: 'from-pink-500 to-rose-500'
    }
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  }

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
            Why Choose VLOGSPHERE?
          </h2>
          <p className="text-xl text-[var(--theme-text-secondary)] max-w-3xl mx-auto">
            Experience the next generation of vlogging with cutting-edge technology, 
            stunning design, and powerful features that empower creators.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ 
                scale: 1.05,
                transition: { type: "spring", stiffness: 300 }
              }}
              className="glass-card p-8 rounded-2xl text-center group cursor-pointer"
            >
              <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-r ${feature.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-xl font-bold text-[var(--theme-text)] mb-4">
                {feature.title}
              </h3>
              
              <p className="text-[var(--theme-text-secondary)] leading-relaxed">
                {feature.description}
              </p>
              
              <div className="mt-6">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-[var(--theme-accent)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Technology Stack */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-20 glass-card p-8 rounded-2xl"
        >
          <h3 className="text-2xl font-bold text-[var(--theme-text)] mb-8 text-center">
            Built with Modern Technology
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { name: 'React 18', color: 'text-blue-400' },
              { name: 'Node.js', color: 'text-green-400' },
              { name: 'MongoDB', color: 'text-green-500' },
              { name: 'Tailwind CSS', color: 'text-cyan-400' },
              { name: 'Framer Motion', color: 'text-purple-400' },
              { name: 'Cloudinary', color: 'text-blue-500' },
              { name: 'JWT Auth', color: 'text-red-400' },
              { name: 'AI/ML', color: 'text-yellow-400' }
            ].map((tech, index) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + index * 0.05 }}
                className="text-center"
              >
                <div className={`w-16 h-16 mx-auto mb-3 rounded-xl bg-[var(--glass-white)] flex items-center justify-center ${tech.color} font-bold text-lg`}>
                  {tech.name.charAt(0)}
                </div>
                <p className="text-sm font-medium text-[var(--theme-text)]">
                  {tech.name}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default FeatureShowcase