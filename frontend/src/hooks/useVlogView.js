import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { vlogAPI } from "../services/api";

export const useVlogView = (vlogId) => {
  const queryClient = useQueryClient();
  const hasRecordedView = useRef(false);

  useEffect(() => {
    if (!vlogId) return;
    
    // CRITICAL: Only record view ONCE per hook instance
    if (hasRecordedView.current) return;

    // Check if already recorded in session
    const sessionKey = `view_recorded_${vlogId}`;
    if (sessionStorage.getItem(sessionKey)) {
      hasRecordedView.current = true;
      return;
    }

    // Mark as recorded immediately to prevent race conditions
    hasRecordedView.current = true;

    // Record view (fire-and-forget, no refetch to prevent increment loop)
    vlogAPI
      .recordView(vlogId)
      .then((response) => {
        sessionStorage.setItem(sessionKey, "true");

        // INSTANT UPDATE: Update UI directly from response without refetching
        const { views, incremented } = response.data?.data || {};

        if (incremented && views) {
          queryClient.setQueryData(['vlog', vlogId], (oldData) => {
            if (!oldData?.data?.data) return oldData;

            // OpenAI/cursor style immutable update of deep property
            return {
              ...oldData,
              data: {
                ...oldData.data,
                data: {
                  ...oldData.data.data,
                  views: views
                }
              }
            };
          });
        }
      })
      .catch((error) => {
        // Log errors silently - don't show error toasts for view tracking failures
        console.error("Failed to record view:", error);
      });
  // CRITICAL: Only vlogId in deps - prevents re-run on query invalidations
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vlogId]);
};
