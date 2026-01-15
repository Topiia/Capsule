import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFollowUser } from './useFollowUser';
import { userAPI } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Mock dependencies
vi.mock('../services/api');
vi.mock('../contexts/ToastContext');
vi.mock('../contexts/AuthContext');
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn()
}));

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

describe('useFollowUser Hook', () => {
  const mockShowToast = vi.fn();
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    useToast.mockReturnValue({
      showToast: mockShowToast
    });

    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { _id: 'user1', following: [] }
    });

    useNavigate.mockReturnValue(mockNavigate);
  });

  it('should call API on follow', async () => {
    userAPI.followUser = vi.fn().mockResolvedValue({
      data: { success: true }
    });

    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createWrapper()
    });

    result.current.followUser('user2');

    await waitFor(() => {
      expect(userAPI.followUser).toHaveBeenCalledWith('user2');
    });
  });

  it('should update UI state immediately (optimistic update)', async () => {
    userAPI.followUser = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ data: { success: true } }), 100))
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    // Set initial cache data
    queryClient.setQueryData(['user', 'user2'], {
      _id: 'user2',
      followerCount: 10
    });

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useFollowUser(), { wrapper });

    result.current.followUser('user2');

    // Check optimistic update happened immediately
    await waitFor(() => {
      const cachedData = queryClient.getQueryData(['user', 'user2']);
      expect(cachedData?.followerCount).toBe(11);
    });
  });

  it('should rollback if API fails', async () => {
    userAPI.followUser = vi.fn().mockRejectedValue({
      message: 'Network error'
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    queryClient.setQueryData(['user', 'user2'], {
      _id: 'user2',
      followerCount: 10
    });

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useFollowUser(), { wrapper });

    result.current.followUser('user2');

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
        'error'
      );
    });

    // Check rollback happened
    const cachedData = queryClient.getQueryData(['user', 'user2']);
    expect(cachedData?.followerCount).toBe(10);
  });

  it('should show toast on successful follow', async () => {
    userAPI.followUser = vi.fn().mockResolvedValue({
      data: { success: true }
    });

    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createWrapper()
    });

    result.current.followUser('user2');

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('User followed!', 'success');
    });
  });

  it('should redirect to login if not authenticated', async () => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      user: null
    });

    const { result } = renderHook(() => useFollowUser(), {
      wrapper: createWrapper()
    });

    result.current.followUser('user2');

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Please log in to follow users',
        'info'
      );
      expect(mockNavigate).toHaveBeenCalledWith('/login', expect.any(Object));
    });
  });
});
