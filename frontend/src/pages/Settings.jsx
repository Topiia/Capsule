import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Button from "../components/UI/Button";
import DeleteAccountModal from "../components/UI/DeleteAccountModal";
import {
  Cog6ToothIcon,
  UserIcon,
  ShieldCheckIcon,
  BellIcon,
  PaintBrushIcon,
  MapPinIcon,
  LinkIcon,
  EnvelopeIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

const Settings = () => {
  const [activeTab, setActiveTab] = useState("account");

  const tabs = [
    { id: "account", label: "Account", icon: UserIcon },
    { id: "privacy", label: "Privacy", icon: ShieldCheckIcon },
    { id: "notifications", label: "Notifications", icon: BellIcon },
    { id: "appearance", label: "Appearance", icon: PaintBrushIcon },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center space-x-3 mb-2">
          <Cog6ToothIcon className="w-8 h-8 text-[var(--theme-accent)]" />
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">
            Settings
          </h1>
        </div>
        <p className="text-[var(--theme-text-secondary)]">
          Manage your account preferences and settings
        </p>
      </motion.div>

      {/* Settings Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        {/* Tab Navigation */}
        <div className="border-b border-white/10">
          <nav className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center space-x-2 px-6 py-4 font-medium text-sm whitespace-nowrap
                    transition-all duration-200 border-b-2
                    ${
                      activeTab === tab.id
                        ? "border-[var(--theme-accent)] text-[var(--theme-accent)]"
                        : "border-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] hover:border-white/20"
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6 md:p-8">
          {activeTab === "account" && <AccountSettings />}
          {activeTab === "privacy" && <PrivacySettings />}
          {activeTab === "notifications" && <NotificationsSettings />}
          {activeTab === "appearance" && <AppearanceSettings />}
        </div>
      </motion.div>
    </div>
  );
};

// Account Settings Section
const AccountSettings = () => {
  const navigate = useNavigate();
  const { user, updateUser, updatePassword, logout } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Profile form
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm({
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      bio: user?.bio || "",
      location: user?.location || "",
      website: user?.website || "",
    },
  });

  // Password form
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPasswordForm,
  } = useForm();

  const onProfileSubmit = async (data) => {
    setIsUpdating(true);
    try {
      const result = await updateUser(data);
      if (result.success) {
        toast.success("Profile updated successfully");
      }
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setIsUpdating(false);
    }
  };

  const onPasswordSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updatePassword(
        data.currentPassword,
        data.newPassword,
      );
      if (result.success) {
        resetPasswordForm();
        setShowPasswordForm(false);
      }
    } catch (error) {
      toast.error("Failed to update password");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Profile Information */}
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-text)] mb-6">
          Profile Information
        </h2>

        <form
          onSubmit={handleProfileSubmit(onProfileSubmit)}
          className="space-y-6"
        >
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
              Username
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="text"
                {...registerProfile("username", {
                  required: "Username is required",
                  minLength: {
                    value: 3,
                    message: "Username must be at least 3 characters",
                  },
                })}
                className="w-full pl-10 pr-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Enter your username"
              />
            </div>
            {profileErrors.username && (
              <p className="mt-1 text-sm text-red-400">
                {profileErrors.username.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
              Email
            </label>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="email"
                {...registerProfile("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: "Invalid email address",
                  },
                })}
                className="w-full pl-10 pr-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Enter your email"
              />
            </div>
            {profileErrors.email && (
              <p className="mt-1 text-sm text-red-400">
                {profileErrors.email.message}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
              Bio
            </label>
            <textarea
              {...registerProfile("bio", {
                maxLength: {
                  value: 200,
                  message: "Bio must be less than 200 characters",
                },
              })}
              rows={4}
              className="w-full px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all resize-none"
              placeholder="Tell us about yourself"
            />
            {profileErrors.bio && (
              <p className="mt-1 text-sm text-red-400">
                {profileErrors.bio.message}
              </p>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
              Location
            </label>
            <div className="relative">
              <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="text"
                {...registerProfile("location")}
                className="w-full pl-10 pr-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Your location"
              />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
              Website
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--theme-text-secondary)]" />
              <input
                type="url"
                {...registerProfile("website", {
                  pattern: {
                    value: /^https?:\/\/.+/i,
                    message: "Invalid URL format",
                  },
                })}
                className="w-full pl-10 pr-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="https://yourwebsite.com"
              />
            </div>
            {profileErrors.website && (
              <p className="mt-1 text-sm text-red-400">
                {profileErrors.website.message}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3">
            <Button type="submit" variant="primary" loading={isUpdating}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>

      {/* Password Change */}
      <div className="pt-8 border-t border-white/10">
        <h2 className="text-xl font-bold text-[var(--theme-text)] mb-6">
          Change Password
        </h2>

        {!showPasswordForm ? (
          <Button
            variant="outline"
            leftIcon={<LockClosedIcon className="w-5 h-5" />}
            onClick={() => setShowPasswordForm(true)}
          >
            Change Password
          </Button>
        ) : (
          <form
            onSubmit={handlePasswordSubmit(onPasswordSubmit)}
            className="space-y-6"
          >
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Current Password
              </label>
              <input
                type="password"
                {...registerPassword("currentPassword", {
                  required: "Current password is required",
                })}
                className="w-full px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Enter current password"
              />
              {passwordErrors.currentPassword && (
                <p className="mt-1 text-sm text-red-400">
                  {passwordErrors.currentPassword.message}
                </p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                New Password
              </label>
              <input
                type="password"
                {...registerPassword("newPassword", {
                  required: "New password is required",
                  minLength: {
                    value: 6,
                    message: "Password must be at least 6 characters",
                  },
                })}
                className="w-full px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Enter new password"
              />
              {passwordErrors.newPassword && (
                <p className="mt-1 text-sm text-red-400">
                  {passwordErrors.newPassword.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-[var(--theme-text)] mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                {...registerPassword("confirmPassword", {
                  required: "Please confirm your password",
                })}
                className="w-full px-4 py-3 bg-[var(--glass-white)] border border-white/10 rounded-lg text-[var(--theme-text)] placeholder-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                placeholder="Confirm new password"
              />
              {passwordErrors.confirmPassword && (
                <p className="mt-1 text-sm text-red-400">
                  {passwordErrors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowPasswordForm(false);
                  resetPasswordForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isUpdating}>
                Update Password
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Danger Zone - Delete Account */}
      <div className="pt-8 border-t border-white/10">
        <h2 className="text-xl font-bold text-red-400 mb-6">⚠️ Danger Zone</h2>

        <div className="glass-card p-6 border-2 border-red-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">
            Delete Account
          </h3>
          <p className="text-gray-300 mb-4">
            Once you delete your account, there is no going back. This will
            permanently delete:
          </p>
          <ul className="list-disc list-inside text-gray-400 mb-6 space-y-1">
            <li>Your profile and account data</li>
            <li>All capsules you&apos;ve created</li>
            <li>All comments and likes</li>
            <li>All uploaded images</li>
          </ul>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete Account
          </Button>
        </div>
      </div>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onSuccess={() => {
          // Auto logout and redirect to home
          logout();
          navigate("/");
          toast.success("Account deleted successfully");
        }}
      />
    </motion.div>
  );
};

// Privacy Settings Section
const PrivacySettings = () => {
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: "public",
    showActivity: true,
    allowMessages: true,
    blockedUsers: [],
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = (setting) => {
    setPrivacySettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleVisibilityChange = (value) => {
    setPrivacySettings((prev) => ({
      ...prev,
      profileVisibility: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call would go here
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Privacy settings updated");
    } catch (error) {
      toast.error("Failed to update privacy settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-text)] mb-6">
          Privacy Settings
        </h2>

        {/* Profile Visibility */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Profile Visibility
            </h3>
            <div className="space-y-3">
              {[
                {
                  value: "public",
                  label: "Public",
                  description: "Anyone can view your profile",
                },
                {
                  value: "private",
                  label: "Private",
                  description: "Only you can view your profile",
                },
                {
                  value: "followers",
                  label: "Followers Only",
                  description: "Only your followers can view your profile",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`
                    flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${
                      privacySettings.profileVisibility === option.value
                        ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/10"
                        : "border-white/10 hover:border-white/20 bg-[var(--glass-white)]"
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="profileVisibility"
                    value={option.value}
                    checked={privacySettings.profileVisibility === option.value}
                    onChange={(e) => handleVisibilityChange(e.target.value)}
                    className="mt-1 w-4 h-4 text-[var(--theme-accent)] focus:ring-[var(--theme-accent)]"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-[var(--theme-text)]">
                      {option.label}
                    </div>
                    <div className="text-sm text-[var(--theme-text-secondary)]">
                      {option.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Activity Status */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--theme-text)] mb-1">
                  Show Activity Status
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  Let others see when you&apos;re online
                </p>
              </div>
              <button
                onClick={() => handleToggle("showActivity")}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${privacySettings.showActivity ? "bg-[var(--theme-accent)]" : "bg-gray-600"}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${privacySettings.showActivity ? "translate-x-6" : "translate-x-1"}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Allow Messages */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--theme-text)] mb-1">
                  Allow Direct Messages
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  Allow other users to send you direct messages
                </p>
              </div>
              <button
                onClick={() => handleToggle("allowMessages")}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${privacySettings.allowMessages ? "bg-[var(--theme-accent)]" : "bg-gray-600"}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${privacySettings.allowMessages ? "translate-x-6" : "translate-x-1"}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Blocked Users */}
          <div className="pt-6 border-t border-white/10">
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Blocked Users
            </h3>
            {privacySettings.blockedUsers.length === 0 ? (
              <div className="text-center py-8 glass-card rounded-lg">
                <ShieldCheckIcon className="w-12 h-12 mx-auto mb-3 text-[var(--theme-text-secondary)]" />
                <p className="text-[var(--theme-text-secondary)]">
                  You haven&apos;t blocked any users
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {privacySettings.blockedUsers.map((user) => (
                  <div
                    key={user}
                    className="flex items-center justify-between p-3 glass-card rounded-lg"
                  >
                    <span className="text-[var(--theme-text)]">{user}</span>
                    <Button variant="ghost" size="sm">
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-6">
            <Button variant="primary" onClick={handleSave} loading={isSaving}>
              Save Privacy Settings
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Notifications Settings Section
const NotificationsSettings = () => {
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: {
      newFollower: true,
      newComment: true,
      newLike: true,
      weeklyDigest: false,
    },
    pushNotifications: {
      enabled: true,
      newFollower: true,
      newComment: true,
      newLike: false,
    },
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleEmailToggle = (setting) => {
    setNotificationSettings((prev) => ({
      ...prev,
      emailNotifications: {
        ...prev.emailNotifications,
        [setting]: !prev.emailNotifications[setting],
      },
    }));
  };

  const handlePushToggle = (setting) => {
    setNotificationSettings((prev) => ({
      ...prev,
      pushNotifications: {
        ...prev.pushNotifications,
        [setting]: !prev.pushNotifications[setting],
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call would go here
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Notification settings updated");
    } catch (error) {
      toast.error("Failed to update notification settings");
    } finally {
      setIsSaving(false);
    }
  };

  const ToggleSwitch = ({ checked, onChange }) => (
    <button
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? "bg-[var(--theme-accent)]" : "bg-gray-600"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-text)] mb-6">
          Notification Settings
        </h2>

        {/* Email Notifications */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Email Notifications
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--theme-text)] mb-1">
                    New Follower
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Get notified when someone follows you
                  </div>
                </div>
                <ToggleSwitch
                  checked={notificationSettings.emailNotifications.newFollower}
                  onChange={() => handleEmailToggle("newFollower")}
                />
              </div>

              <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--theme-text)] mb-1">
                    New Comment
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Get notified when someone comments on your capsule
                  </div>
                </div>
                <ToggleSwitch
                  checked={notificationSettings.emailNotifications.newComment}
                  onChange={() => handleEmailToggle("newComment")}
                />
              </div>

              <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--theme-text)] mb-1">
                    New Like
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Get notified when someone likes your capsule
                  </div>
                </div>
                <ToggleSwitch
                  checked={notificationSettings.emailNotifications.newLike}
                  onChange={() => handleEmailToggle("newLike")}
                />
              </div>

              <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--theme-text)] mb-1">
                    Weekly Digest
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Receive a weekly summary of your activity
                  </div>
                </div>
                <ToggleSwitch
                  checked={notificationSettings.emailNotifications.weeklyDigest}
                  onChange={() => handleEmailToggle("weeklyDigest")}
                />
              </div>
            </div>
          </div>

          {/* Push Notifications */}
          <div className="pt-6 border-t border-white/10">
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Push Notifications
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--theme-text)] mb-1">
                    Enable Push Notifications
                  </div>
                  <div className="text-sm text-[var(--theme-text-secondary)]">
                    Allow browser push notifications
                  </div>
                </div>
                <ToggleSwitch
                  checked={notificationSettings.pushNotifications.enabled}
                  onChange={() => handlePushToggle("enabled")}
                />
              </div>

              {notificationSettings.pushNotifications.enabled && (
                <>
                  <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-[var(--theme-text)] mb-1">
                        New Follower
                      </div>
                      <div className="text-sm text-[var(--theme-text-secondary)]">
                        Push notification for new followers
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={
                        notificationSettings.pushNotifications.newFollower
                      }
                      onChange={() => handlePushToggle("newFollower")}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-[var(--theme-text)] mb-1">
                        New Comment
                      </div>
                      <div className="text-sm text-[var(--theme-text-secondary)]">
                        Push notification for new comments
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={
                        notificationSettings.pushNotifications.newComment
                      }
                      onChange={() => handlePushToggle("newComment")}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-[var(--theme-text)] mb-1">
                        New Like
                      </div>
                      <div className="text-sm text-[var(--theme-text-secondary)]">
                        Push notification for new likes
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={notificationSettings.pushNotifications.newLike}
                      onChange={() => handlePushToggle("newLike")}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-6">
            <Button variant="primary" onClick={handleSave} loading={isSaving}>
              Save Notification Settings
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Appearance Settings Section
const AppearanceSettings = () => {
  const { theme, themes, changeTheme, currentTheme } = useTheme();
  const [appearanceSettings, setAppearanceSettings] = useState({
    displayDensity: "comfortable",
    autoplayVideos: true,
    reducedMotion: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = (setting) => {
    setAppearanceSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleDensityChange = (value) => {
    setAppearanceSettings((prev) => ({
      ...prev,
      displayDensity: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // API call would go here
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Appearance settings updated");
    } catch (error) {
      toast.error("Failed to update appearance settings");
    } finally {
      setIsSaving(false);
    }
  };

  const ToggleSwitch = ({ checked, onChange }) => (
    <button
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? "bg-[var(--theme-accent)]" : "bg-gray-600"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-text)] mb-6">
          Appearance Settings
        </h2>

        {/* Theme Selection */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Theme
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(themes).map(([key, themeOption]) => (
                <motion.button
                  key={key}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => changeTheme(key)}
                  className={`
                    p-4 rounded-lg border-2 transition-all duration-200
                    ${
                      theme === key
                        ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/20"
                        : "border-white/10 hover:border-white/20 bg-[var(--glass-white)]"
                    }
                  `}
                >
                  <div className="flex flex-col items-center space-y-3">
                    {/* Theme Preview */}
                    <div
                      className={`w-16 h-16 rounded-lg bg-gradient-to-br ${themeOption.gradient} shadow-lg`}
                    />

                    <div className="text-center">
                      <h4 className="font-medium text-[var(--theme-text)] mb-1">
                        {themeOption.name}
                      </h4>
                      <p className="text-xs text-[var(--theme-text-secondary)]">
                        {themeOption.description}
                      </p>
                    </div>

                    {/* Active Indicator */}
                    {theme === key && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-6 h-6 bg-[var(--theme-accent)] rounded-full flex items-center justify-center"
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
            <div className="mt-3 flex items-center space-x-2 text-sm text-[var(--theme-text-secondary)]">
              <div
                className={`w-4 h-4 rounded bg-gradient-to-br ${currentTheme.gradient}`}
              />
              <span>Current theme: {currentTheme.name}</span>
            </div>
          </div>

          {/* Display Density */}
          <div className="pt-6 border-t border-white/10">
            <h3 className="text-lg font-semibold text-[var(--theme-text)] mb-4">
              Display Density
            </h3>
            <div className="space-y-3">
              {[
                {
                  value: "comfortable",
                  label: "Comfortable",
                  description: "More spacing between elements",
                },
                {
                  value: "compact",
                  label: "Compact",
                  description: "Less spacing, more content visible",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`
                    flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${
                      appearanceSettings.displayDensity === option.value
                        ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]/10"
                        : "border-white/10 hover:border-white/20 bg-[var(--glass-white)]"
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="displayDensity"
                    value={option.value}
                    checked={appearanceSettings.displayDensity === option.value}
                    onChange={(e) => handleDensityChange(e.target.value)}
                    className="mt-1 w-4 h-4 text-[var(--theme-accent)] focus:ring-[var(--theme-accent)]"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-[var(--theme-text)]">
                      {option.label}
                    </div>
                    <div className="text-sm text-[var(--theme-text-secondary)]">
                      {option.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Autoplay Videos */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--theme-text)] mb-1">
                  Autoplay Videos
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  Automatically play videos when scrolling
                </p>
              </div>
              <ToggleSwitch
                checked={appearanceSettings.autoplayVideos}
                onChange={() => handleToggle("autoplayVideos")}
              />
            </div>
          </div>

          {/* Reduced Motion */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--theme-text)] mb-1">
                  Reduced Motion
                </h3>
                <p className="text-sm text-[var(--theme-text-secondary)]">
                  Minimize animations and transitions for accessibility
                </p>
              </div>
              <ToggleSwitch
                checked={appearanceSettings.reducedMotion}
                onChange={() => handleToggle("reducedMotion")}
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-6">
            <Button variant="primary" onClick={handleSave} loading={isSaving}>
              Save Appearance Settings
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Settings;
