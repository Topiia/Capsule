import { vi } from "vitest";

const defaultUser = {
  _id: "testuser123",
  username: "testuser",
  email: "test@example.com",
  role: "user",
};

export const createMockApi = () => ({
  authAPI: {
    getMe: vi.fn(),
    login: vi.fn().mockResolvedValue({ data: { message: "Success" } }),
    logout: vi.fn().mockResolvedValue({ data: { message: "Logged out" } }),
    register: vi.fn().mockResolvedValue({ data: { message: "Registered" } }),
    forgotPassword: vi.fn().mockResolvedValue({ data: { message: "Email sent" } }),
    resetPassword: vi.fn().mockResolvedValue({ data: { message: "Password reset" } }),
  },
  vlogAPI: {
    getVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getVlog: vi.fn().mockResolvedValue({ data: { vlog: { _id: "v1", title: "Test", creator: defaultUser._id } } }),
    getTrending: vi.fn().mockResolvedValue({ data: { vlogs: [] } }),
    likeVlog: vi.fn().mockResolvedValue({ data: { likes: [defaultUser._id] } }),
    dislikeVlog: vi.fn().mockResolvedValue({ data: { dislikes: [defaultUser._id] } }),
    shareVlog: vi.fn().mockResolvedValue({ data: { shareCount: 1 } }),
    createVlog: vi.fn().mockResolvedValue({ data: { vlog: { _id: "newvlog" } } }),
    updateVlog: vi.fn().mockResolvedValue({ data: { vlog: { _id: "v1" } } }),
    deleteVlog: vi.fn().mockResolvedValue({ data: { message: "Deleted" } }),
  },
  userAPI: {
    getUser: vi.fn().mockResolvedValue({ data: { user: defaultUser } }),
    getUserByUsername: vi.fn().mockResolvedValue({ data: { profile: defaultUser, vlogs: [] } }),
    getBookmarks: vi.fn().mockResolvedValue({ data: { bookmarks: [] } }),
    addBookmark: vi.fn().mockResolvedValue({ data: { bookmarks: ["v1"] } }),
    removeBookmark: vi.fn().mockResolvedValue({ data: { bookmarks: [] } }),
    followUser: vi.fn().mockResolvedValue({ data: { followers: [defaultUser._id] } }),
    unfollowUser: vi.fn().mockResolvedValue({ data: { followers: [] } }),
    getFollowers: vi.fn().mockResolvedValue({ data: { followers: [] } }),
    getFollowing: vi.fn().mockResolvedValue({ data: { following: [] } }),
  },
  uploadAPI: {
    uploadSingle: vi.fn().mockResolvedValue({ data: { url: "http://test.com/img.jpg" } }),
  },
  adminAPI: {
    getFlaggedVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [] } }),
    getMetrics: vi.fn().mockResolvedValue({ data: { totalUsers: 10 } }),
  },
});
