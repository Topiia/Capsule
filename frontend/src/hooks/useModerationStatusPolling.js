import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

/**
 * Hook to poll for moderation status updates
 * Automatically polls user's vlogs every 15s if any are PENDING
 * Stops polling when all vlogs are non-PENDING
 *
 * @param {string} userId - Current user ID
 * @param {Array} vlogs - Current vlogs array
 * @param {Function} onStatusChange - Callback when status changes (vlog, oldStatus, newStatus)
 * @param {number} pollInterval - Interval in ms (default: 15000)
 * @returns {Object} - { isPolling, startPolling, stopPolling }
 */
const useModerationStatusPolling = (
  userId,
  vlogs = [],
  onStatusChange,
  pollInterval = 15000
) => {
  const intervalRef = useRef(null);
  const previousStatusMapRef = useRef(new Map());
  const isPollingRef = useRef(false);

  // Check if any vlog is PENDING
  const hasPendingVlogs = useCallback(() => {
    return vlogs.some((vlog) => vlog.status === 'PENDING');
  }, [vlogs]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      isPollingRef.current = false;
      console.log('[Moderation Polling] Stopped polling');
    }
  }, []);

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await axios.get(`/api/vlogs/user/${userId}`, {
        params: { limit: 100 }, // Get all user vlogs
      });

      const updatedVlogs = response.data.data;

      // Check for status changes
      updatedVlogs.forEach((vlog) => {
        const previousStatus = previousStatusMapRef.current.get(vlog._id);
        const currentStatus = vlog.status;

        if (previousStatus && previousStatus !== currentStatus) {
          // Status changed - trigger callback
          if (onStatusChange) {
            onStatusChange(vlog, previousStatus, currentStatus);
          }
        }

        // Update status map
        previousStatusMapRef.current.set(vlog._id, currentStatus);
      });

      // Stop polling if no PENDING vlogs
      if (!updatedVlogs.some((v) => v.status === 'PENDING')) {
        stopPolling();
      }
    } catch (error) {
      console.error('Moderation status polling error:', error);
      // Don't stop polling on error - network issues may be temporary
    }
  }, [userId, onStatusChange, stopPolling]);

  // Start polling
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return; // Already polling

    isPollingRef.current = true;
    intervalRef.current = setInterval(pollStatus, pollInterval);
    console.log('[Moderation Polling] Started polling for status updates');
  }, [pollStatus, pollInterval]);

  // Initialize status map from current vlogs
  useEffect(() => {
    vlogs.forEach((vlog) => {
      if (!previousStatusMapRef.current.has(vlog._id)) {
        previousStatusMapRef.current.set(vlog._id, vlog.status);
      }
    });
  }, [vlogs]);

  // Auto-start/stop polling based on PENDING status
  useEffect(() => {
    if (!userId) return;

    if (hasPendingVlogs()) {
      startPolling();
    } else {
      stopPolling();
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [userId, hasPendingVlogs, startPolling, stopPolling]);

  return {
    isPolling: isPollingRef.current,
    startPolling,
    stopPolling,
  };
};

export default useModerationStatusPolling;
