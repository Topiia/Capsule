import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiAlertTriangle, FiX, FiKey, FiTrash2 } from "react-icons/fi";
import PropTypes from "prop-types";
import { deleteUserAccount } from "../../services/api";

/**
 * DeleteAccountModal Component
 *
 * Two-step confirmation modal for account deletion:
 * 1. Warning screen with consequences
 * 2. Password re-authentication screen
 *
 * Security Features:
 * - Password verification required
 * - Clear warning about permanent data loss
 * - Loading states during API call
 * - Error handling with user feedback
 */

function DeleteAccountModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1 = warning, 2 = password confirmation
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCancel = () => {
    setStep(1);
    setPassword("");
    setError("");
    onClose();
  };

  const handleContinue = () => {
    setStep(2);
    setError("");
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      // Call delete account API
      await deleteUserAccount(password);

      // Success - trigger callback
      onSuccess();
    } catch (err) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        "Account deletion failed. Please try again.";

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleCancel}
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 25 }}
          className="relative w-full max-w-md glass-card p-6 border-2 border-red-500/30"
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={handleCancel}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            disabled={isLoading}
          >
            <FiX size={24} />
          </button>

          {/* Step 1: Warning Screen */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <FiAlertTriangle className="text-red-400" size={32} />
                </div>
              </div>

              {/* Title */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Delete Account
                </h2>
                <p className="text-gray-400">This action cannot be undone</p>
              </div>

              {/* Warning List */}
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-300 font-semibold mb-3">
                  ⚠️ This will permanently delete:
                </p>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Your profile and account data</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>All capsules you&apos;ve created</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>All comments and likes</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>All uploaded images</span>
                  </li>
                </ul>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 
                           text-white rounded-lg transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 
                           text-white rounded-lg transition-all duration-300
                           hover:shadow-lg hover:shadow-red-500/50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Password Confirmation */}
          {step === 2 && (
            <form onSubmit={handleDeleteAccount} className="space-y-6">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <FiKey className="text-red-400" size={32} />
                </div>
              </div>

              {/* Title */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Confirm Deletion
                </h2>
                <p className="text-gray-400">Enter your password to confirm</p>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label
                  htmlFor="delete-password"
                  className="block text-sm font-medium text-gray-300"
                >
                  Password
                </label>
                <input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 
                           rounded-lg text-white placeholder-gray-500
                           focus:outline-none focus:border-red-500 transition-colors"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/20 border border-red-500 rounded-lg p-3"
                >
                  <p className="text-red-300 text-sm">{error}</p>
                </motion.div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 
                           text-white rounded-lg transition-all duration-300"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 
                           text-white rounded-lg transition-all duration-300
                           hover:shadow-lg hover:shadow-red-500/50
                           disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <FiTrash2 size={18} />
                      <span>Delete Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

DeleteAccountModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

export default DeleteAccountModal;
