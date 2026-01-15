import { motion, AnimatePresence } from 'framer-motion'
import { forwardRef, useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility function to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Ripple effect component
const Ripple = ({ x, y, size }) => {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0.5 }}
      animate={{ scale: 2, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: 'currentColor',
        pointerEvents: 'none',
      }}
    />
  )
}

const Button = forwardRef((
  {
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    onClick,
    ...props
  },
  ref
) => {
  const [ripples, setRipples] = useState([])

  const variants = {
    primary: 'bg-[var(--theme-accent)] text-white hover:bg-[var(--theme-accent)]/90 shadow-lg hover:shadow-xl',
    secondary: 'bg-[var(--glass-white)] text-[var(--theme-text)] hover:bg-[var(--glass-white)]/80 border border-white/20',
    outline: 'border-2 border-[var(--theme-accent)] text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white',
    ghost: 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:bg-[var(--glass-white)]',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg hover:shadow-xl',
    success: 'bg-green-500 text-white hover:bg-green-600 shadow-lg hover:shadow-xl',
  }

  const sizes = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    xl: 'px-8 py-4 text-xl',
  }

  const buttonClasses = cn(
    'relative inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] focus:ring-offset-2 focus:ring-offset-[var(--theme-primary)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    loading && 'cursor-wait',
    className
  )

  const handleClick = (e) => {
    if (disabled || loading) return

    // Create ripple effect
    const button = e.currentTarget
    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const newRipple = {
      x,
      y,
      size,
      id: Date.now(),
    }

    setRipples((prev) => [...prev, newRipple])

    // Remove ripple after animation
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id))
    }, 600)

    // Call original onClick
    if (onClick) {
      onClick(e)
    }
  }

  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      className={buttonClasses}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {/* Ripple Effects */}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <Ripple key={ripple.id} x={ripple.x} y={ripple.y} size={ripple.size} />
        ))}
      </AnimatePresence>

      {/* Loading Spinner */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <motion.div
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      )}

      {/* Button Content */}
      <motion.span
        className={cn(
          'flex items-center justify-center space-x-2',
          loading && 'opacity-0'
        )}
        initial={false}
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        <span>{children}</span>
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </motion.span>

      {/* Hover Glow Effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-lg opacity-0 pointer-events-none"
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  )
})

Button.displayName = 'Button'

// Icon Button Component
export const IconButton = forwardRef((
  {
    icon,
    variant = 'ghost',
    size = 'md',
    disabled = false,
    loading = false,
    className,
    ...props
  },
  ref
) => {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-14 h-14',
  }

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      disabled={disabled}
      loading={loading}
      className={cn(sizes[size], 'rounded-full', className)}
      {...props}
    >
      {icon}
    </Button>
  )
})

IconButton.displayName = 'IconButton'

// Floating Action Button
export const FloatingActionButton = forwardRef((
  {
    icon,
    onClick,
    position = 'bottom-right',
    className,
    ...props
  },
  ref
) => {
  const positions = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  }

  return (
    <motion.button
      ref={ref}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={cn(
        'fixed z-50 w-14 h-14 bg-[var(--theme-accent)] text-white rounded-full shadow-lg shadow-[var(--theme-accent)]/30 hover:shadow-xl hover:shadow-[var(--theme-accent)]/40 transition-all duration-200 flex items-center justify-center',
        positions[position],
        className
      )}
      {...props}
    >
      {icon}
    </motion.button>
  )
})

FloatingActionButton.displayName = 'FloatingActionButton'

// Button Group Component
export const ButtonGroup = ({ children, className = '', vertical = false }) => {
  return (
    <div className={cn(
      'flex',
      vertical ? 'flex-col space-y-2' : 'flex-row space-x-2',
      className
    )}>
      {children}
    </div>
  )
}

export default Button