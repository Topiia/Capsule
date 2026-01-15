import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { authAPI } from '../../services/api'
import Button from '../../components/UI/Button'
import Logo from '../../components/UI/Logo'
import {
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const ResetPassword = () => {
  const navigate = useNavigate()
  const { token } = useParams()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      password: '',
      confirmPassword: ''
    }
  })

  const password = watch('password')

  // Password requirements for validation
  const passwordRequirements = [
    { text: 'At least 6 characters', test: (pwd) => pwd.length >= 6 },
    { text: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
    { text: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
    { text: 'Contains a number', test: (pwd) => /\d/.test(pwd) }
  ]

  // Check if all password requirements are met
  const isPasswordValid = (pwd) => {
    return passwordRequirements.every(req => req.test(pwd))
  }

  const onSubmit = async (data) => {
    setLoading(true)
    setTokenError(false)
    
    try {
      await authAPI.resetPassword(token, data.password)
      setSuccess(true)
      toast.success('Password reset successful! Redirecting to login...')
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2000)
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message || 'Failed to reset password'
      
      // Check if it's a token error
      if (error.response?.status === 400 || message.toLowerCase().includes('token') || message.toLowerCase().includes('expired')) {
        setTokenError(true)
        // Clear sensitive form data
        document.getElementById('password').value = ''
        document.getElementById('confirmPassword').value = ''
      }
      
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  }

  // Focus password input on mount
  useEffect(() => {
    if (!success) {
      document.getElementById('password')?.focus()
    }
  }, [success])

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl"></div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-md w-full space-y-8 relative z-10"
      >
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h2 className="text-3xl font-bold gradient-text mb-2">
            {success ? 'Password Reset!' : 'Reset Your Password'}
          </h2>
          <p className="text-[var(--theme-text-secondary)]">
            {success 
              ? "Your password has been successfully reset"
              : "Enter your new password below"
            }
          </p>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="glass-card p-8 rounded-2xl space-y-6">
              {/* Token Error Message */}
              {tokenError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
                >
                  <p className="text-sm text-red-400 mb-2">
                    Invalid or expired reset token. Please request a new password reset email.
                  </p>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-[var(--theme-accent)] hover:text-[var(--theme-accent)]/80 font-medium"
                  >
                    Request new reset email →
                  </Link>
                </motion.div>
              )}

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-[var(--theme-text-secondary)]" />
                  </div>
                  <input
                    {...register('password', {
                      required: 'Password is required',
                      validate: {
                        strength: (value) => 
                          isPasswordValid(value) || 'Password must meet all requirements'
                      }
                    })}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="glass-input pl-11 pr-11"
                    placeholder="Enter your new password"
                    disabled={loading}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-10 flex items-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* Password Requirements Checklist */}
                {password && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-1"
                  >
                    {passwordRequirements.map((req, index) => (
                      <div
                        key={index}
                        className={`flex items-center space-x-2 text-xs ${
                          req.test(password)
                            ? 'text-green-400'
                            : 'text-[var(--theme-text-secondary)]'
                        }`}
                      >
                        <CheckIcon className={`w-3 h-3 ${
                          req.test(password) ? 'opacity-100' : 'opacity-0'
                        }`} />
                        <span>{req.text}</span>
                      </div>
                    ))}
                  </motion.div>
                )}

                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-400"
                  >
                    {errors.password.message}
                  </motion.p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-[var(--theme-text-secondary)]" />
                  </div>
                  <input
                    {...register('confirmPassword', {
                      required: 'Please confirm your password',
                      validate: (value) =>
                        value === password || 'Passwords do not match'
                    })}
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    className="glass-input pl-11 pr-11"
                    placeholder="Confirm your new password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-10 flex items-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]"
                  >
                    {showConfirmPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-400"
                  >
                    {errors.confirmPassword.message}
                  </motion.p>
                )}
              </div>

              {/* Submit Button */}
              <div>
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  variant="primary"
                  loading={loading}
                  className="mt-4"
                >
                  {loading ? 'Resetting Password...' : 'Reset Password'}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="glass-card p-8 rounded-2xl">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[var(--theme-text)]">
                Your password has been successfully reset!
              </p>
              <p className="text-sm text-[var(--theme-text-secondary)]">
                You will be redirected to the login page shortly.
              </p>
            </div>
          </div>
        )}

        {/* Links */}
        <div className="text-center space-y-3">
          {!success && tokenError && (
            <Link
              to="/forgot-password"
              className="block text-[var(--theme-accent)] hover:text-[var(--theme-accent)]/80 font-medium transition-colors"
            >
              Request new reset email
            </Link>
          )}
          <Link
            to="/login"
            className="text-[var(--theme-accent)] hover:text-[var(--theme-accent)]/80 font-medium transition-colors inline-flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Login</span>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

export default ResetPassword
