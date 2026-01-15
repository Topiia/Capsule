import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVlogView } from './useVlogView';
import { vlogAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// Mock dependencies
vi.mock('../services/api');
vi.mock('../contexts/AuthContext');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useVlogView Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    useAuth.mockReturnValue({
      isAuthenticated: true
    });

    vlogAPI.recordView = vi.fn().mockResolvedValue({
      data: { success: true }
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should call recordView on first mount', async () => {
    const vlogId = 'vlog123';

    renderHook(() => useVlogView(vlogId), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(vlogAPI.recordView).toHaveBeenCalledWith(vlogId);
    });
  });

  it('should NOT call recordView again if sessionStorage already has vlogId', async () => {
    const vlogId = 'vlog123';
    sessionStorage.setItem(`view_recorded_${vlogId}`, 'true');

    renderHook(() => useVlogView(vlogId), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(vlogAPI.recordView).not.toHaveBeenCalled();
    });
  });

  it('should NOT call recordView when user is not logged in', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: false
    });

    const vlogId = 'vlog123';

    renderHook(() => useVlogView(vlogId), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(vlogAPI.recordView).not.toHaveBeenCalled();
    });
  });

  it('should set sessionStorage after successful view recording', async () => {
    const vlogId = 'vlog123';

    renderHook(() => useVlogView(vlogId), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(sessionStorage.getItem(`view_recorded_${vlogId}`)).toBe('true');
    });
  });

  it('should handle errors silently without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vlogAPI.recordView = vi.fn().mockRejectedValue(new Error('Network error'));

    const vlogId = 'vlog123';

    expect(() => {
      renderHook(() => useVlogView(vlogId), {
        wrapper: createWrapper()
      });
    }).not.toThrow();

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to record view:',
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it('should not call recordView if vlogId is null', async () => {
    renderHook(() => useVlogView(null), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(vlogAPI.recordView).not.toHaveBeenCalled();
    });
  });
});
