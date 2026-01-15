import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FollowButton from './FollowButton';
import { useFollowUser } from '../../hooks/useFollowUser';
import { useAuth } from '../../contexts/AuthContext';

// Mock the hooks
vi.mock('../../hooks/useFollowUser');
vi.mock('../../contexts/AuthContext');

const createWrapper = (currentUserData = null) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  // Set currentUser cache data
  if (currentUserData) {
    queryClient.setQueryData(['currentUser'], currentUserData);
  }

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('FollowButton', () => {
  const mockFollowUser = vi.fn();
  const mockUnfollowUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    useFollowUser.mockReturnValue({
      followUser: mockFollowUser,
      unfollowUser: mockUnfollowUser,
      isFollowing: false,
      isUnfollowing: false
    });

    useAuth.mockReturnValue({
      user: { _id: 'currentUser' }
    });
  });

  it('should render "Follow" when not following (reads from cache)', () => {
    const currentUserData = {
      _id: 'currentUser',
      following: [] // Not following user123
    };

    render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    expect(screen.getByText('Follow')).toBeInTheDocument();
  });

  it('should render "Following" when following (reads from cache)', () => {
    const currentUserData = {
      _id: 'currentUser',
      following: ['user123'] // Following user123
    };

    render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    expect(screen.getByText('Following')).toBeInTheDocument();
  });

  it('should call followUser API when clicking Follow button', () => {
    const currentUserData = {
      _id: 'currentUser',
      following: []
    };

    render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    const button = screen.getByText('Follow');
    fireEvent.click(button);

    expect(mockFollowUser).toHaveBeenCalledWith('user123');
    expect(mockFollowUser).toHaveBeenCalledTimes(1);
  });

  it('should call unfollowUser API when clicking Following button', () => {
    const currentUserData = {
      _id: 'currentUser',
      following: ['user123']
    };

    render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    const button = screen.getByText('Following');
    fireEvent.click(button);

    expect(mockUnfollowUser).toHaveBeenCalledWith('user123');
    expect(mockUnfollowUser).toHaveBeenCalledTimes(1);
  });

  it('should disable button during loading', () => {
    useFollowUser.mockReturnValue({
      followUser: mockFollowUser,
      unfollowUser: mockUnfollowUser,
      isFollowing: true, // Loading state
      isUnfollowing: false
    });

    const currentUserData = {
      _id: 'currentUser',
      following: []
    };

    render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Loading...');
  });

  it('should not render for own profile', () => {
    useAuth.mockReturnValue({
      user: { _id: 'user123' }
    });

    const currentUserData = {
      _id: 'user123',
      following: []
    };

    const { container } = render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper: createWrapper(currentUserData) }
    );

    expect(container.firstChild).toBeNull();
  });

  it('should update when cache changes', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    // Initially not following
    queryClient.setQueryData(['currentUser'], {
      _id: 'currentUser',
      following: []
    });

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { rerender } = render(
      <FollowButton userId="user123" username="testuser" />,
      { wrapper }
    );

    expect(screen.getByText('Follow')).toBeInTheDocument();

    // Update cache to following
    queryClient.setQueryData(['currentUser'], {
      _id: 'currentUser',
      following: ['user123']
    });

    rerender(<FollowButton userId="user123" username="testuser" />);

    expect(screen.getByText('Following')).toBeInTheDocument();
  });
});
