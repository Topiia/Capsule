import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VlogCard from '../components/Vlog/VlogCard';
import { useAuth } from '../contexts/AuthContext';
import { useVlogInteractions } from '../hooks/useVlogInteractions';

// Mock dependencies
vi.mock('../contexts/AuthContext');
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));
vi.mock('../hooks/useVlogInteractions');
vi.mock('../hooks/useFollowUser', () => ({
  useFollowUser: () => ({
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
    isFollowing: false,
    isUnfollowing: false
  })
}));

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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Follow & View UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { _id: 'user1', following: [] }
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
  });

  it('should show updated view count in VlogCard', () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      description: 'Test description',
      views: 1234,
      likes: [],
      dislikes: [],
      comments: [],
      tags: [],
      category: 'technology',
      images: [{ url: 'test.jpg' }],
      author: {
        _id: 'author1',
        username: 'testauthor',
        followerCount: 100
      },
      createdAt: new Date().toISOString()
    };

    render(<VlogCard vlog={mockVlog} />, { wrapper: createWrapper() });

    // Check if view count is displayed (formatted as 1.2K)
    expect(screen.getByText(/1\.2K|1,234/)).toBeInTheDocument();
  });

  it('should show follower count in VlogCard', () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      description: 'Test description',
      views: 100,
      likes: [],
      dislikes: [],
      comments: [],
      tags: [],
      category: 'technology',
      images: [{ url: 'test.jpg' }],
      author: {
        _id: 'author1',
        username: 'testauthor',
        followerCount: 500
      },
      createdAt: new Date().toISOString()
    };

    render(<VlogCard vlog={mockVlog} />, { wrapper: createWrapper() });

    // Check if follower count is displayed
    expect(screen.getByText(/500 followers/)).toBeInTheDocument();
  });

  it('should display Follow button for other users', () => {
    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      description: 'Test description',
      views: 100,
      likes: [],
      dislikes: [],
      comments: [],
      tags: [],
      category: 'technology',
      images: [{ url: 'test.jpg' }],
      author: {
        _id: 'author1',
        username: 'testauthor',
        followerCount: 100
      },
      createdAt: new Date().toISOString()
    };

    render(<VlogCard vlog={mockVlog} />, { wrapper: createWrapper() });

    expect(screen.getByText('Follow')).toBeInTheDocument();
  });

  it('should NOT display Follow button for own vlogs', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      user: { _id: 'author1', following: [] }
    });

    const mockVlog = {
      _id: 'vlog1',
      title: 'Test Vlog',
      description: 'Test description',
      views: 100,
      likes: [],
      dislikes: [],
      comments: [],
      tags: [],
      category: 'technology',
      images: [{ url: 'test.jpg' }],
      author: {
        _id: 'author1',
        username: 'testauthor',
        followerCount: 100
      },
      createdAt: new Date().toISOString()
    };

    render(<VlogCard vlog={mockVlog} />, { wrapper: createWrapper() });

    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });
});
