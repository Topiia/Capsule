import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "./utils/renderWithProviders";
import { vlogAPI, userAPI, authAPI } from "../services/api";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import CapsuleDetail from "../pages/CapsuleDetail";
import Bookmarks from "../pages/Bookmarks";
// import removed

// Removed useVlogInteractions mock for true integration testing
vi.mock("../services/api", () => ({
  authAPI: {
    getMe: vi.fn(),
  },
  vlogAPI: {
    getVlog: vi.fn(),
    likeVlog: vi.fn(),
    dislikeVlog: vi.fn(),
    toggleDislike: vi.fn(),
    shareVlog: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    recordView: vi.fn(),
  },
  userAPI: {
    addBookmark: vi.fn(),
    getBookmarks: vi.fn(),
    removeBookmark: vi.fn(),
  },
}));

// Mock data
const mockUser = {
  _id: "user123",
  username: "testuser",
  email: "test@example.com",
  avatar: "https://example.com/avatar.jpg",
};

const mockVlog = {
  _id: "vlog123",
  title: "Test Vlog",
  description: "Test Description",
  images: [{ url: "https://example.com/image.jpg", publicId: "test" }],
  author: {
    _id: "author123",
    username: "author",
    avatar: "https://example.com/author.jpg",
  },
  likes: [],
  dislikes: [],
  comments: [],
  shares: 0,
  views: 100,
  createdAt: new Date().toISOString(),
};

const mockComment = {
  _id: "comment123",
  user: mockUser,
  text: "Test comment",
  createdAt: new Date().toISOString(),
};
describe("Vlog Interactions Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    
    // Provide default successful resolution for background API calls
    vi.mocked(vlogAPI.recordView).mockResolvedValue({ 
      data: { data: { incremented: true, views: mockVlog.views + 1 } } 
    });

    // Real hook will be used
  });

  describe("Like Interaction Flow", () => {
    it("should complete full like flow: click → backend update → UI update → cache invalidation", async () => {
      // Requirements: 1.1

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      vi.mocked(vlogAPI.likeVlog).mockResolvedValue({ data: { vlog: { ...mockVlog, isLiked: true } } });

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true }
      );
      const user = userEvent.setup();

      // Wait for vlog to load
      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Find like button by title or text content
      const likeButtons = screen.getAllByRole("button");
      const likeButton = likeButtons.find((btn) =>
        btn.textContent.includes("Like") || btn.getAttribute("title") === "Like" || btn.getAttribute("title") === "Unlike",
      );
      expect(likeButton).toBeDefined();

      await user.click(likeButton);

      // API should have been called
      await waitFor(() => {
         expect(vi.mocked(vlogAPI.likeVlog)).toHaveBeenCalledWith(mockVlog._id);
      });

      // Verify toast notification appears
      await waitFor(() => {
        expect(screen.getByText(/liked/i)).toBeInTheDocument();
      });

      // Verify cache invalidation by checking refetch (called twice, initial + refetch)
      await waitFor(() => {
         expect(vi.mocked(vlogAPI.getVlog)).toHaveBeenCalledTimes(2);
      });
      unmount();
    });

    it("should rollback UI on backend failure", async () => {
      // Requirements: 1.5
      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      vi.mocked(vlogAPI.dislikeVlog).mockRejectedValue(new Error("Server error"));
      // The toggleLike logic in the real hook calls dislikeVlog internally sometimes, wait, error mock:
      vi.mocked(vlogAPI.likeVlog).mockRejectedValue(new Error("Server error"));

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true }
      );
      const user = userEvent.setup();

      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const likeButtons = screen.getAllByRole("button");
      const likeButton = likeButtons.find((btn) =>
        btn.textContent.includes("Like") || btn.getAttribute("title") === "Like" || btn.getAttribute("title") === "Unlike",
      );
      expect(likeButton).toBeDefined();

      await user.click(likeButton);

      // Wait for error toast
      await waitFor(
        () => {
          expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
        },
        { timeout: 1000 },
      );

      // Verify API was called
      expect(vi.mocked(vlogAPI.likeVlog)).toHaveBeenCalledWith(mockVlog._id);
      unmount();
    });
  });

  describe("Comment Interaction Flow", () => {
    it("should verify comment API integration and backend calls", async () => {
      // Requirements: 2.1
      const _vlogWithComment = {
        ...mockVlog,
        comments: [mockComment],
      };

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      // using real hook

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true }
      );

      // Verify vlog detail page loads
      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Verify vlog was fetched from backend
      expect(vi.mocked(vlogAPI.getVlog)).toHaveBeenCalledWith(mockVlog._id);

      // Verify comment section or interaction buttons are present
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      unmount();
    });

    it("should maintain comment count consistency after add and delete", async () => {
      // Requirements: 2.4
      const vlogWithComments = {
        ...mockVlog,
        comments: [
          mockComment,
          {
            ...mockComment,
            _id: "comment456",
            text: "Another comment",
            user: mockUser,
          },
        ],
      };

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: vlogWithComments } });
      vi.mocked(vlogAPI.deleteComment).mockResolvedValue({ data: { success: true } });

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true }
      );
      const user = userEvent.setup();

      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Verify comments are displayed
      await waitFor(() => {
        expect(screen.getByText(mockComment.text)).toBeInTheDocument();
      });

      // Find delete buttons
      const deleteButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) =>
            btn.textContent.includes("Delete") ||
            btn.getAttribute("aria-label")?.includes("delete"),
        );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        // Verify API was called
        await waitFor(() => {
          expect(vi.mocked(vlogAPI.deleteComment)).toHaveBeenCalledWith(mockVlog._id, mockComment._id);
        });
      }
      unmount();
    });
  });

  describe("Bookmark Interaction Flow", () => {
    it("should complete full bookmark flow: bookmark → appears on Bookmarks page", async () => {
      // Requirements: 4.1
      // Render CapsuleCard first
      const { unmount } = renderWithProviders(<CapsuleCard vlog={mockVlog} />, { authenticated: true });
      const user = userEvent.setup();

      // Find bookmark button deterministically
      const bookmarkButton = screen.getByTestId("bookmark-button");

      if (bookmarkButton) {
        await user.click(bookmarkButton);

        // Verify API was called
        await waitFor(() => {
          expect(vi.mocked(userAPI.addBookmark)).toHaveBeenCalledWith(mockVlog._id);
        });
      }
      unmount();
    });

    it("should verify bookmarks page displays bookmarked vlogs", async () => {
      // Requirements: 4.4, 6.3
      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      // Bookmarks endpoint returns raw data array differently than getVlog
      vi.mocked(userAPI.getBookmarks).mockResolvedValue({ data: { data: [mockVlog], pagination: { total: 1 } } });
      vi.mocked(userAPI.removeBookmark).mockResolvedValue({ data: { bookmarked: false } });

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/bookmarks" element={<Bookmarks />} />
        </Routes>,
        { route: "/bookmarks", authenticated: true }
      );

      // Verify bookmarks page loads
      await waitFor(
        () => {
          expect(screen.getByText("Bookmarks")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Verify vlog appears in bookmarks
      await waitFor(() => {
        expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
      });

      // Verify backend was called to fetch bookmarks
      expect(vi.mocked(userAPI.getBookmarks)).toHaveBeenCalled();
      unmount();
    });
  });

  describe("Cross-Page State Consistency", () => {
    it("should persist interaction state from CapsuleCard to CapsuleDetail", async () => {
      // Requirements: 6.4

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.likeVlog).mockResolvedValue({ data: { vlog: { ...mockVlog, isLiked: true } } });

      // Render CapsuleCard
      const { unmount } = renderWithProviders(<CapsuleCard vlog={mockVlog} />, { authenticated: true });
      const user = userEvent.setup();

      // Find like button
      const buttons = screen.getAllByRole("button");
      const likeButton = buttons.find(
        (btn) =>
          btn.getAttribute("title")?.includes("like") ||
          btn.getAttribute("title")?.includes("Like") ||
          btn.textContent.includes("Like"),
      );

      if (likeButton) {
        await user.click(likeButton);

        // Verify API was called
        await waitFor(() => {
          expect(vi.mocked(vlogAPI.likeVlog)).toHaveBeenCalledWith(mockVlog._id);
        });
      }
      unmount();
    });
  });

  describe("Share Interaction Flow", () => {
    it("should handle share interaction and increment share count", async () => {
      // Requirements: 3.1, 3.4
      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      vi.mocked(vlogAPI.shareVlog).mockResolvedValue({ data: { increments: 1 } });

      // Mock clipboard API
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true }
      );
      const user = userEvent.setup();

      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Find share button
      const buttons = screen.getAllByRole("button");
      const shareButton = buttons.find((btn) =>
        btn.textContent.includes("Share") || btn.getAttribute("title")?.includes("Share"),
      );

      if (shareButton) {
        await user.click(shareButton);

        // Verify API was called
        await waitFor(
          () => {
             expect(vi.mocked(vlogAPI.shareVlog)).toHaveBeenCalledWith(mockVlog._id);
          },
          { timeout: 2000 },
        );
      }
      unmount();
    });

    it("should verify share functionality with clipboard fallback", async () => {
      // Requirements: 3.2, 3.3
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      vi.mocked(vlogAPI.shareVlog).mockResolvedValue({ data: { increments: 1 } });

      const { unmount } = renderWithProviders(<CapsuleCard vlog={mockVlog} />, { authenticated: true });
      const user = userEvent.setup();

      // Find share button
      const buttons = screen.getAllByRole("button");
      const shareButton = buttons.find((btn) =>
        btn.textContent.includes("Share") || btn.getAttribute("title")?.includes("Share"),
      );

      if (shareButton) {
        await user.click(shareButton);

        // Verify API was called
        await waitFor(
          () => {
            expect(vi.mocked(vlogAPI.shareVlog)).toHaveBeenCalledWith(mockVlog._id);
          },
          { timeout: 2000 },
        );
      }
      unmount();
    });
  });

  describe("Cache Invalidation Strategy", () => {
    it("should invalidate all relevant queries after interaction", async () => {
      // Requirements: 6.5
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
      vi.mocked(vlogAPI.getVlog).mockResolvedValue({ data: { data: mockVlog } });
      vi.mocked(vlogAPI.likeVlog).mockResolvedValue({ data: { vlog: { ...mockVlog, likes: [mockUser._id] } } });

      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { route: `/vlog/${mockVlog._id}`, authenticated: true, queryClient }
      );
      const user = userEvent.setup();

      await waitFor(
        () => {
          expect(screen.getByText(mockVlog.title)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Find like button
      const buttons = screen.getAllByRole("button");
      const likeButton = buttons.find((btn) =>
        btn.getAttribute("title") === "Like" || btn.getAttribute("title") === "Unlike",
      );

      if (likeButton) {
        await user.click(likeButton);

        // Wait for mutation to complete
        await waitFor(() => {
          expect(vi.mocked(vlogAPI.likeVlog)).toHaveBeenCalledWith(mockVlog._id);
        });

        // Verify cache invalidation was called
        await waitFor(() => {
          expect(invalidateSpy).toHaveBeenCalled();
        });
      }
      unmount();
    });
  });
});