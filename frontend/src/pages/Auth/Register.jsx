import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../contexts/AuthContext'
import { isValidEmail, isValidPassword } from '../../utils/helpers'
import Button from '../../components/UI/Button'
import Logo from '../../components/UI/Logo'
import LoadingSpinner from '../../components/UI/LoadingSpinner'
import {
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  EnvelopeIcon,
  LockClosedIcon,
  CheckIcon
} from '@heroicons/react/24/outline'

const Register = () => {
  const navigate = useNavigate()
  const { register: registerUser } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false
    }
  })

  const password = watch('password')

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const result = await registerUser({
        username: data.username,
        email: data.email,
        password: data.password
      })
      
      if (result.success) {
        navigate('/dashboard')
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

  const passwordRequirements = [
    { text: 'At least 6 characters', test: (pwd) => pwd.length >= 6 },
    { text: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
    { text: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
    { text: 'Contains a number', test: (pwd) => /\d/.test(pwd) }
  ]

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden pb-20">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-full blur-3xl"></div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-lg w-full space-y-6 max-[480px]:space-y-4 relative z-10"
      >
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h2 className="text-3xl font-bold gradient-text mb-2">
            Create Your Account
          </h2>
          <p className="text-[var(--theme-text-secondary)]">
            Join the future of visual storytelling
          </p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-[480px]:space-y-4">
          <div className="glass-card p-8 max-[480px]:p-5 rounded-2xl space-y-5 max-[480px]:space-y-4">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-[var(--theme-text-secondary)]" />
                </div>
                <input
                  {...register('username', {
                    required: 'Username is required',
                    minLength: {
                      value: 3,
                      message: 'Username must be at least 3 characters'
                    },
                    maxLength: {
                      value: 30,
                      message: 'Username cannot exceed 30 characters'
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9_]+$/,
                      message: 'Username can only contain letters, numbers, and underscores'
                    }
                  })}
                  type="text"
                  id="username"
                  className="glass-input pl-11"
                  placeholder="Choose a username"
                  disabled={loading}
                />
              </div>
              {errors.username && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 break-words"
                >
                  {errors.username.message}
                </motion.p>
              )}
            </div>

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
                />
              </div>
              {errors.email && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 break-words"
                >
                  {errors.email.message}
                </motion.p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Password
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
                        isValidPassword(value) || 'Password must contain at least 6 characters, 1 uppercase, 1 lowercase, and 1 number'
                    }
                  })}
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="glass-input pl-11 pr-11"
                  placeholder="Create a strong password"
                  disabled={loading}
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
              
              {/* Password Requirements */}
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
                  className="mt-2 text-sm text-red-400 break-words"
                >
                  {errors.password.message}
                </motion.p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Confirm Password
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
                  placeholder="Confirm your password"
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
                  className="mt-2 text-sm text-red-400 break-words"
                >
                  {errors.confirmPassword.message}
                </motion.p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div>
              <label className="flex items-start">
                <input
                  {...register('agreeToTerms', {
                    required: 'You must agree to the terms and conditions'
                  })}
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-[var(--theme-accent)] bg-transparent border-[var(--theme-text-secondary)] rounded focus:ring-[var(--theme-accent)]"
                  disabled={loading}
                />
                <span className="ml-2 text-sm text-[var(--theme-text-secondary)]">
                  I agree to the{' '}
                  <Link to="/terms" className="text-[var(--theme-accent)] hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-[var(--theme-accent)] hover:underline">
                    Privacy Policy
                  </Link>
                </span>
              </label>
              {errors.agreeToTerms && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 break-words"
                >
                  {errors.agreeToTerms.message}
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
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </div>
          </div>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/20"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 glass text-[var(--theme-text-secondary)]">
              Or sign up with
            </span>
          </div>
        </div>

        {/* Social Sign Up Options */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            disabled={loading}
            className="flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Google</span>
          </Button>

          <Button
            variant="secondary"
            disabled={loading}
            className="flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
            </svg>
            <span>Twitter</span>
          </Button>
        </div>

        {/* Sign In Link */}
        <div className="text-center mt-8">
          <p className="text-[var(--theme-text-secondary)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[var(--theme-accent)] hover:text-[var(--theme-accent)]/80 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Demo Info */}
        <div className="mt-8 p-4 glass-card rounded-xl">
          <h3 className="text-sm font-medium text-[var(--theme-text)] mb-3 text-center">
            Quick Start
          </h3>
          <p className="text-xs text-[var(--theme-text-secondary)] text-center">
            Registration is instant! Try creating your account to experience the full platform features.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default Register