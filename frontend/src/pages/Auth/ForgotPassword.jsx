import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { authAPI } from '../../services/api'
import Button from '../../components/UI/Button'
import Logo from '../../components/UI/Logo'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: ''
    }
  })

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      await authAPI.forgotPassword(data.email)
      setSubmitted(true)
      toast.success('If an account exists with this email, you will receive a password reset link.')
    } catch (error) {
      // For security reasons, always show the same message whether the email exists or not
      // This prevents email enumeration attacks
      if (error.response?.status === 404) {
        // Email not found - but don't tell the user
        setSubmitted(true)
        toast.success('If an account exists with this email, you will receive a password reset link.')
      } else {
        // Only show actual errors (network issues, server errors, etc.)
        const message = error.response?.data?.error?.message || error.message || 'Failed to send reset email'
        toast.error(message)
      }
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
            Forgot Password?
          </h2>
          <p className="text-[var(--theme-text-secondary)]">
            {submitted 
              ? "Check your email for reset instructions"
              : "Enter your email to receive a password reset link"
            }
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="glass-card p-8 rounded-2xl space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <EnvelopeIcon className="h-5 w-5 text-[var(--theme-text-secondary)]" />
                  </div>
                  <input
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Invalid email address'
                      }
                    })}
                    type="email"
                    id="email"
                    className="glass-input pl-11"
                    placeholder="Enter your email"
                    disabled={loading}
                    autoFocus
                  />
                </div>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-400"
                  >
                    {errors.email.message}
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
                  {loading ? 'Sending...' : 'Send Reset Link'}
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
                If an account exists with this email, you will receive a password reset link shortly.
              </p>
              <p className="text-sm text-[var(--theme-text-secondary)]">
                Please check your inbox and spam folder.
              </p>
            </div>
          </div>
        )}

        {/* Back to Login Link */}
        <div className="text-center">
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

export default ForgotPassword
