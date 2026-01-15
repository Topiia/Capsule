import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { vlogAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export const useVlogView = (vlogId) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !vlogId) return;

    // Check if already recorded in session
    const sessionKey = `view_recorded_${vlogId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    // Record view
    vlogAPI
      .recordView(vlogId)
      .then(() => {
        sessionStorage.setItem(sessionKey, 'true');
        // Invalidate vlog queries to update view count
        queryClient.invalidateQueries({ queryKey: ['vlog', vlogId] });
        queryClient.invalidateQueries({ queryKey: ['vlogs'] });
      })
      .catch((error) => {
        // Log errors silently - don't show error toasts for view tracking failures
        console.error('Failed to record view:', error);
      });
  }, [vlogId, isAuthenticated, queryClient]);
};
