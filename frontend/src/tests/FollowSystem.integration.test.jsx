import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import FollowButton from '../components/UI/FollowButton';
import VlogCard from '../components/Vlog/VlogCard';
import { useAuth } from '../contexts/AuthContext';
import { useFollowUser } from '../hooks/useFollowUser';
import { useVlogInteractions } from '../hooks/useVlogInteractions';
import { updateFollowCache } from '../utils/cacheHelpers';

// Mock dependencies
vi.mock('../contexts/AuthContext');
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));
vi.mock('../hooks/useVlogInteractions');

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

describe('Follow System Integration Tests', () => {
  let queryClient;
  let mockFollowUser;
  let mockUnfollowUser;

  const createWrapper = () => {
    return ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    mockFollowUser = vi.fn();
    mockUnfollowUser = vi.fn();

    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { _id: 'currentUser', following: [] }
    });

    useVlogInteractions.mockReturnValue({
      toggleLike: vi.fn(),
      toggleDislike: vi.fn(),
      shareVlog: vi.fn(),
      toggleBookmark: vi.fn(),
      isLiking: false,
      isDisliking: false,
      isSharing: false,
      isBookmarking: false
    });

    // Set initial cache data
    queryClient.setQueryData(['currentUser'], {
      _id: 'currentUser',
      username: 'testuser',
      following: [],
      followingCount: 0
    });
  });

  describe('Cross-page synchronization', () => {
    it('should update followerCount across all VlogCards when following', () => {
      const author = {
        _id: 'author1',
        username: 'author',
        followerCount: 100
      };

      const mockVlog1 = {
        _id: 'vlog1',
        title: 'Vlog 1',
        description: 'Description 1',
        views: 100,
        likes: [],
        dislikes: [],
        comments: [],
        tags: [],
        category: 'technology',
        images: [{ url: 'test1.jpg' }],
        author: { ...author },
        createdAt: new Date().toISOString()
      };

      const mockVlog2 = {
        _id: 'vlog2',
        title: 'Vlog 2',
        description: 'Description 2',
        views: 200,
        likes: [],
        dislikes: [],
        comments: [],
        tags: [],
        category: 'technology',
        images: [{ url: 'test2.jpg' }],
        author: { ...author },
        createdAt: new Date().toISOString()
      };

      // Set up vlogs cache
      queryClient.setQueryData(['vlogs'], {
        pages: [{
          data: [mockVlog1, mockVlog2]
        }],
        pageParams: [undefined]
      });

      const { rerender } = render(
        <>
          <VlogCard vlog={mockVlog1} />
          <VlogCard vlog={mockVlog2} />
        </>,
        { wrapper: createWrapper() }
      );

      // Both should show 100 followers
      const followerTexts = screen.getAllByText(/100 followers/);
      expect(followerTexts).toHaveLength(2);

      // Simulate follow action by updating cache
      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      rerender(
        <>
          <VlogCard vlog={mockVlog1} />
          <VlogCard vlog={mockVlog2} />
        </>
      );

      // Both should now show 101 followers
      waitFor(() => {
        const updatedFollowerTexts = screen.getAllByText(/101 followers/);
        expect(updatedFollowerTexts).toHaveLength(2);
      });
    });

    it('should synchronize FollowButton state across multiple instances', () => {
      queryClient.setQueryData(['currentUser'], {
        _id: 'currentUser',
        following: []
      });

      const { rerender } = render(
        <>
          <FollowButton userId="author1" username="author" />
          <FollowButton userId="author1" username="author" />
        </>,
        { wrapper: createWrapper() }
      );

      // Both buttons should show "Follow"
      const followButtons = screen.getAllByText('Follow');
      expect(followButtons).toHaveLength(2);

      // Update cache to simulate follow
      queryClient.setQueryData(['currentUser'], {
        _id: 'currentUser',
        following: ['author1']
      });

      rerender(
        <>
          <FollowButton userId="author1" username="author" />
          <FollowButton userId="author1" username="author" />
        </>
      );

      // Both buttons should now show "Following"
      const followingButtons = screen.getAllByText('Following');
      expect(followingButtons).toHaveLength(2);
    });
  });

  describe('Cache updates', () => {
    it('should update following array in currentUser cache', () => {
      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      const currentUser = queryClient.getQueryData(['currentUser']);
      expect(currentUser.following).toContain('author1');
      expect(currentUser.followingCount).toBe(1);
    });

    it('should remove from following array on unfollow', () => {
      queryClient.setQueryData(['currentUser'], {
        _id: 'currentUser',
        following: ['author1', 'author2'],
        followingCount: 2
      });

      updateFollowCache(queryClient, 'author1', false, 'currentUser');

      const currentUser = queryClient.getQueryData(['currentUser']);
      expect(currentUser.following).not.toContain('author1');
      expect(currentUser.following).toContain('author2');
      expect(currentUser.followingCount).toBe(1);
    });

    it('should update followerCount in user cache', () => {
      queryClient.setQueryData(['user', 'author1'], {
        _id: 'author1',
        username: 'author',
        followerCount: 100
      });

      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      const user = queryClient.getQueryData(['user', 'author1']);
      expect(user.followerCount).toBe(101);
    });

    it('should update followerCount in vlog cache', () => {
      queryClient.setQueryData(['vlog', 'vlog1'], {
        _id: 'vlog1',
        title: 'Test Vlog',
        author: {
          _id: 'author1',
          username: 'author',
          followerCount: 100
        }
      });

      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      const vlog = queryClient.getQueryData(['vlog', 'vlog1']);
      expect(vlog.author.followerCount).toBe(101);
    });

    it('should update followerCount in paginated vlogs cache', () => {
      queryClient.setQueryData(['vlogs'], {
        pages: [{
          data: [{
            _id: 'vlog1',
            author: {
              _id: 'author1',
              followerCount: 100
            }
          }]
        }],
        pageParams: [undefined]
      });

      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      const vlogs = queryClient.getQueryData(['vlogs']);
      expect(vlogs.pages[0].data[0].author.followerCount).toBe(101);
    });
  });

  describe('Data consistency', () => {
    it('should maintain consistent followerCount across all cache entries', () => {
      // Set up multiple cache entries for the same author
      queryClient.setQueryData(['user', 'author1'], {
        _id: 'author1',
        followerCount: 100
      });

      queryClient.setQueryData(['vlog', 'vlog1'], {
        _id: 'vlog1',
        author: {
          _id: 'author1',
          followerCount: 100
        }
      });

      queryClient.setQueryData(['vlogs'], {
        pages: [{
          data: [{
            _id: 'vlog2',
            author: {
              _id: 'author1',
              followerCount: 100
            }
          }]
        }]
      });

      // Follow the author
      updateFollowCache(queryClient, 'author1', true, 'currentUser');

      // Check all cache entries have consistent followerCount
      const user = queryClient.getQueryData(['user', 'author1']);
      const vlog = queryClient.getQueryData(['vlog', 'vlog1']);
      const vlogs = queryClient.getQueryData(['vlogs']);

      expect(user.followerCount).toBe(101);
      expect(vlog.author.followerCount).toBe(101);
      expect(vlogs.pages[0].data[0].author.followerCount).toBe(101);
    });

    it('should not create negative followerCount', () => {
      queryClient.setQueryData(['user', 'author1'], {
        _id: 'author1',
        followerCount: 0
      });

      // Try to unfollow when count is already 0
      updateFollowCache(queryClient, 'author1', false, 'currentUser');

      const user = queryClient.getQueryData(['user', 'author1']);
      expect(user.followerCount).toBe(0);
      expect(user.followerCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Own profile handling', () => {
    it('should not render FollowButton for own profile', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { _id: 'author1' }
      });

      queryClient.setQueryData(['currentUser'], {
        _id: 'author1',
        following: []
      });

      const { container } = render(
        <FollowButton userId="author1" username="author" />,
        { wrapper: createWrapper() }
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
