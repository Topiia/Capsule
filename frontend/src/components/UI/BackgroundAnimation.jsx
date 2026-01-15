import { memo } from 'react'
import PropTypes from 'prop-types'

/**
 * BackgroundAnimation Component
 * 
 * A GPU-optimized background animation featuring Aurora Glow + Gradient Blobs
 * Designed for smooth performance across all devices
 * 
 * @param {number} brightness - Controls overall brightness (0-1, default: 0.5)
 * @param {number} opacity - Controls animation opacity (0-1, default: 0.3)
 * @param {string} intensity - Animation speed: 'low' | 'medium' | 'high' (default: 'medium')
 */
const BackgroundAnimation = memo(({ 
  brightness = 0.5, 
  opacity = 0.3, 
  intensity = 'medium' 
}) => {
  // Animation duration based on intensity
  const durations = {
    low: '40s',
    medium: '25s',
    high: '15s'
  }

  const duration = durations[intensity] || durations.medium

  // Calculate brightness multiplier
  const brightnessValue = Math.max(0, Math.min(1, brightness))
  const opacityValue = Math.max(0, Math.min(1, opacity))

  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      style={{ 
        isolation: 'isolate',
        willChange: 'transform'
      }}
      aria-hidden="true"
    >
      {/* Base gradient background */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
        style={{ opacity: brightnessValue }}
      />

      {/* Aurora Blob 1 - Purple/Pink */}
      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, rgba(168, 85, 247, ${opacityValue * 0.4}) 0%, rgba(236, 72, 153, ${opacityValue * 0.3}) 50%, transparent 100%)`,
          animation: `aurora-float-1 ${duration} ease-in-out infinite`,
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform'
        }}
      />

      {/* Aurora Blob 2 - Blue/Cyan */}
      <div
        className="absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, rgba(59, 130, 246, ${opacityValue * 0.4}) 0%, rgba(6, 182, 212, ${opacityValue * 0.3}) 50%, transparent 100%)`,
          animation: `aurora-float-2 ${duration} ease-in-out infinite`,
          animationDelay: '5s',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform'
        }}
      />

      {/* Aurora Blob 3 - Indigo/Purple */}
      <div
        className="absolute bottom-0 left-1/4 w-[550px] h-[550px] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, rgba(99, 102, 241, ${opacityValue * 0.35}) 0%, rgba(139, 92, 246, ${opacityValue * 0.25}) 50%, transparent 100%)`,
          animation: `aurora-float-3 ${duration} ease-in-out infinite`,
          animationDelay: '10s',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform'
        }}
      />

      {/* Gradient Blob 4 - Teal/Green (subtle accent) */}
      <div
        className="absolute top-1/2 left-1/2 w-[450px] h-[450px] rounded-full blur-[100px]"
        style={{
          background: `radial-gradient(circle, rgba(20, 184, 166, ${opacityValue * 0.25}) 0%, rgba(16, 185, 129, ${opacityValue * 0.2}) 50%, transparent 100%)`,
          animation: `aurora-float-4 ${duration} ease-in-out infinite`,
          animationDelay: '15s',
          transform: 'translate3d(-50%, -50%, 0)',
          willChange: 'transform'
        }}
      />

      {/* Ambient glow overlay for depth */}
      <div 
        className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-gray-900/50"
        style={{ 
          mixBlendMode: 'multiply',
          opacity: brightnessValue * 0.5
        }}
      />
    </div>
  )
})

BackgroundAnimation.displayName = 'BackgroundAnimation'

BackgroundAnimation.propTypes = {
  brightness: PropTypes.number,
  opacity: PropTypes.number,
  intensity: PropTypes.oneOf(['low', 'medium', 'high'])
}

export default BackgroundAnimation
