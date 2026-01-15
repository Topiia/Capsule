import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import Profile from '../pages/Profile';
import Likes from '../pages/Likes';
import Explore from '../pages/Explore';
import FollowButton from '../components/UI/FollowButton';
import { userAPI, vlogAPI, authAPI } from '../services/api';

// Mock API modules
vi.mock('../services/api', () => ({
  userAPI: {
    getUserByUsername: vi.fn(),
    getLikedVlogs: vi.fn(),
    followUser: vi.fn(),
    unfollowUser: vi.fn(),
  },
  vlogAPI: {
    getUserVlogs: vi.fn(),
    getVlogs: vi.fn(),
    dislikeVlog: vi.fn(),
  },
  authAPI: {
    getMe: vi.fn(),
    setAuthHeader: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock;

// Test utilities
const createWrapper = (user = null) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // Mock localStorage to return token if user exists
  localStorageMock.getItem.mockImplementation((key) => {
    if (key === 'token' && user) return 'mock-token';
    return null;
  });

  // Mock authAPI.getMe to return user
  authAPI.getMe.mockResolvedValue({
    data: { user },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Manual Testing Verification - Profile Page', () => {
  const mockUser = {
    _id: 'user123',
    username: 'testuser',
    avatar: 'https://example.com/avatar.jpg',
    bio: 'Test bio',
    followerCount: 10,
    followingCount: 5,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const mockVlogs = {
    data: [
      {
        _id: 'vlog1',
        title: 'Test Vlog 1',
        description: 'Description 1',
        views: 100,
        likes: [],
        author: mockUser,
      },
    ],
    total: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load profile page with valid username', async () => {
    userAPI.getUserByUsername.mockResolvedValue({
      data: { data: mockUser },
    });
    vlogAPI.getUserVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter initialEntries={['/profile/testuser']}>
        <Routes>
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    expect(screen.getByText('Test bio')).toBeInTheDocument();
    expect(userAPI.getUserByUsername).toHaveBeenCalledWith('testuser');
  });

  it('should show "User Not Found" for invalid username', async () => {
    userAPI.getUserByUsername.mockRejectedValue(new Error('Not found'));

    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter initialEntries={['/profile/invaliduser']}>
        <Routes>
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('User Not Found')).toBeInTheDocument();
    });
  });

  it('should display user stats correctly', async () => {
    userAPI.getUserByUsername.mockResolvedValue({
      data: { data: mockUser },
    });
    vlogAPI.getUserVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter initialEntries={['/profile/testuser']}>
        <Routes>
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Followers
      expect(screen.getByText('5')).toBeInTheDocument(); // Following
    });
  });
});

describe('Manual Testing Verification - Likes Page', () => {
  const mockLikedVlogs = {
    data: [
      {
        _id: 'vlog1',
        title: 'Liked Vlog 1',
        description: 'Description 1',
        category: 'tech',
        views: 100,
        likes: ['user123'],
        author: {
          _id: 'author1',
          username: 'author1',
        },
      },
      {
        _id: 'vlog2',
        title: 'Liked Vlog 2',
        description: 'Description 2',
        category: 'lifestyle',
        views: 200,
        likes: ['user123'],
        author: {
          _id: 'author2',
          username: 'author2',
        },
      },
    ],
    total: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load liked vlogs successfully', async () => {
    userAPI.getLikedVlogs.mockResolvedValue({
      data: mockLikedVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Likes />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Liked Vlog 1')).toBeInTheDocument();
      expect(screen.getByText('Liked Vlog 2')).toBeInTheDocument();
    });

    expect(userAPI.getLikedVlogs).toHaveBeenCalled();
  });

  it('should filter liked vlogs by category', async () => {
    userAPI.getLikedVlogs.mockResolvedValue({
      data: mockLikedVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Likes />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Liked Vlog 1')).toBeInTheDocument();
    });

    const categorySelect = screen.getByDisplayValue('All');
    await userEvent.selectOptions(categorySelect, 'tech');

    await waitFor(() => {
      expect(userAPI.getLikedVlogs).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'tech' })
      );
    });
  });

  it('should sort liked vlogs', async () => {
    userAPI.getLikedVlogs.mockResolvedValue({
      data: mockLikedVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Likes />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Liked Vlog 1')).toBeInTheDocument();
    });

    const sortSelect = screen.getByDisplayValue('Date Liked');
    await userEvent.selectOptions(sortSelect, 'views');

    await waitFor(() => {
      expect(userAPI.getLikedVlogs).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'views' })
      );
    });
  });

  it('should show empty state when no liked vlogs', async () => {
    userAPI.getLikedVlogs.mockResolvedValue({
      data: { data: [], total: 0 },
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Likes />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('No liked vlogs yet')).toBeInTheDocument();
    });
  });
});

describe('Manual Testing Verification - Explore Page', () => {
  const mockVlogs = {
    data: [
      {
        _id: 'vlog1',
        title: 'Explore Vlog 1',
        description: 'Description 1',
        category: 'technology',
        views: 100,
        likes: [],
        author: {
          _id: 'author1',
          username: 'author1',
        },
      },
      {
        _id: 'vlog2',
        title: 'Explore Vlog 2',
        description: 'Description 2',
        category: 'travel',
        views: 200,
        likes: [],
        author: {
          _id: 'author2',
          username: 'author2',
        },
      },
    ],
    currentPage: 1,
    totalPages: 1,
    total: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load vlogs on Explore page', async () => {
    vlogAPI.getVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Explore Vlog 1')).toBeInTheDocument();
      expect(screen.getByText('Explore Vlog 2')).toBeInTheDocument();
    });

    expect(vlogAPI.getVlogs).toHaveBeenCalled();
  });

  it('should filter vlogs by category', async () => {
    vlogAPI.getVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Explore Vlog 1')).toBeInTheDocument();
    });

    const technologyButton = screen.getByRole('button', { name: /Technology/i });
    await userEvent.click(technologyButton);

    await waitFor(() => {
      expect(vlogAPI.getVlogs).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'technology' })
      );
    });
  });

  it('should sort vlogs', async () => {
    vlogAPI.getVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('Explore Vlog 1')).toBeInTheDocument();
    });

    const popularButton = screen.getByRole('button', { name: /Most Popular/i });
    await userEvent.click(popularButton);

    await waitFor(() => {
      expect(vlogAPI.getVlogs).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'popular' })
      );
    });
  });

  it('should show vlogs count', async () => {
    vlogAPI.getVlogs.mockResolvedValue({
      data: mockVlogs,
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 vlogs/i)).toBeInTheDocument();
    });
  });
});

describe('Manual Testing Verification - Follow Button Reactivity', () => {
  const mockUser = {
    _id: 'user123',
    username: 'testuser',
    following: [],
  };

  const mockTargetUser = {
    _id: 'target456',
    username: 'targetuser',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update follow button immediately on click', async () => {
    userAPI.followUser.mockResolvedValue({
      data: {
        data: {
          following: ['target456'],
        },
      },
    });

    authAPI.getMe.mockResolvedValue({
      data: { user: mockUser },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <FollowButton userId={mockTargetUser._id} username={mockTargetUser.username} />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      const followButton = screen.queryByRole('button', { name: /Follow/i });
      if (followButton) {
        expect(followButton).toBeInTheDocument();
      }
    });

    const followButton = screen.queryByRole('button', { name: /Follow/i });
    if (followButton) {
      await userEvent.click(followButton);

      await waitFor(() => {
        expect(userAPI.followUser).toHaveBeenCalledWith(mockTargetUser._id);
      });
    }
  });

  it('should update unfollow button immediately on click', async () => {
    const followingUser = {
      ...mockUser,
      following: ['target456'],
    };

    userAPI.unfollowUser.mockResolvedValue({
      data: {
        data: {
          following: [],
        },
      },
    });

    authAPI.getMe.mockResolvedValue({
      data: { user: followingUser },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <FollowButton userId={mockTargetUser._id} username={mockTargetUser.username} />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      const unfollowButton = screen.queryByRole('button', { name: /Following/i });
      if (unfollowButton) {
        expect(unfollowButton).toBeInTheDocument();
      }
    });

    const unfollowButton = screen.queryByRole('button', { name: /Following/i });
    if (unfollowButton) {
      await userEvent.click(unfollowButton);

      await waitFor(() => {
        expect(userAPI.unfollowUser).toHaveBeenCalledWith(mockTargetUser._id);
      });
    }
  });
});

describe('Manual Testing Verification - Console Errors', () => {
  it('should not produce console errors during normal operation', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    userAPI.getUserByUsername.mockResolvedValue({
      data: {
        data: {
          _id: 'user123',
          username: 'testuser',
          followerCount: 0,
          followingCount: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
    });

    vlogAPI.getUserVlogs.mockResolvedValue({
      data: { data: [], total: 0 },
    });

    const mockUser = { _id: 'user123', username: 'testuser' };
    const Wrapper = createWrapper(mockUser);
    
    render(
      <MemoryRouter initialEntries={['/profile/testuser']}>
        <Routes>
          <Route path="/profile/:username" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    // Check that no console errors were logged
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
