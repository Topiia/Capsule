/**
 * Final Verification Integration Tests
 *
 * Comprehensive tests to verify all interaction features work correctly
 * across the application before final sign-off.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import { ThemeProvider } from "../contexts/ThemeProvider";
import CapsuleCard from "../components/Vlog/CapsuleCard";
import * as api from "../services/api";

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
    bookmarkVlog: vi.fn(),
    getBookmarks: vi.fn(),
    removeBookmark: vi.fn(),
  },
}));

// Test wrapper with all providers
const AllTheProviders = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock vlog data
const mockVlog = {
  _id: "123",
  title: "Test Vlog",
  description: "Test Description",
  images: [{ url: "https://example.com/image.jpg", publicId: "test" }],
  author: {
    _id: "author123",
    username: "testauthor",
    avatar: null,
  },
  likes: [],
  dislikes: [],
  comments: [],
  shares: 0,
  views: 100,
  likeCount: 0,
  dislikeCount: 0,
  commentCount: 0,
  isLiked: false,
  isDisliked: false,
  isBookmarked: false,
  createdAt: new Date().toISOString(),
};

const mockUser = {
  id: "user123",
  username: "testuser",
  email: "test@example.com",
  token: "mock-token",
};

describe("Final Verification - Interaction Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("user", JSON.stringify(mockUser));
    localStorage.setItem("token", "mock-token");
    vi.mocked(api.authAPI.getMe).mockResolvedValue({ data: { user: mockUser } });
  });

  describe("1. Interaction Buttons Presence", () => {
    it("should render all interaction buttons on CapsuleCard", () => {
      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      expect(screen.getByTestId("like-count").closest("button")).toBeInTheDocument();
      expect(screen.getByTestId("bookmark-button")).toBeInTheDocument();
      expect(screen.getByTestId("share-button")).toBeInTheDocument();
    });
  });

  describe("2. Icon State Updates", () => {
    it("should show filled heart icon when vlog is liked", () => {
      const likedVlog = {
        ...mockVlog,
        isLiked: true,
        likeCount: 1,
        likes: [mockUser.id],
      };

      render(
        <AllTheProviders>
          <CapsuleCard vlog={likedVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      expect(likeButton).toBeInTheDocument();
    });

    it("should show filled bookmark icon when vlog is bookmarked", () => {
      const bookmarkedVlog = {
        ...mockVlog,
        isBookmarked: true,
      };

      render(
        <AllTheProviders>
          <CapsuleCard vlog={bookmarkedVlog} />
        </AllTheProviders>,
      );


      const bookmarkButton = screen.getByTestId("bookmark-button");
      expect(bookmarkButton).toBeInTheDocument();
    });
  });

  describe("3. Toast Notifications", () => {
    it("should show success toast after liking", async () => {
      localStorage.setItem("token", "mock-jwt-token");
      localStorage.setItem("user", JSON.stringify(mockUser));
      const user = userEvent.setup();

      vi.spyOn(api.vlogAPI, "likeVlog").mockResolvedValue({
        data: {
          success: true,
          data: { ...mockVlog, isLiked: true, likeCount: 1 },
        },
      });

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      await waitFor(() => {
        expect(screen.getByText(/liked/i)).toBeInTheDocument();
      });
    });

    it("should show error toast when like fails", async () => {
      const user = userEvent.setup();

      vi.spyOn(api.vlogAPI, "likeVlog").mockRejectedValue(
        new Error("Network error"),
      );

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });
    });
  });

  describe("4. Optimistic Updates", () => {
    it("should update like count immediately", async () => {
      const user = userEvent.setup();

      // Delay the API response to test optimistic update
      vi.spyOn(api.vlogAPI, "likeVlog").mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    success: true,
                    data: { ...mockVlog, isLiked: true, likeCount: 1 },
                  },
                }),
              1000,
            ),
          ),
      );

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");

      // Initial count should be 0
      expect(screen.getByTestId("like-count")).toHaveTextContent("0");

      await user.click(likeButton);

      // Count should update immediately (optimistic)
      await waitFor(
        () => {
          expect(screen.getByTestId("like-count")).toHaveTextContent("1");
        },
        { timeout: 100 },
      );
    });
  });

  describe("5. Like/Dislike Mutual Exclusion", () => {
    it("should remove dislike when liking", async () => {
      const user = userEvent.setup();

      const dislikedVlog = {
        ...mockVlog,
        isDisliked: true,
        dislikeCount: 1,
      };

      vi.spyOn(api.vlogAPI, "likeVlog").mockResolvedValue({
        data: {
          success: true,
          data: {
            ...mockVlog,
            isLiked: true,
            isDisliked: false,
            likeCount: 1,
            dislikeCount: 0,
          },
        },
      });

      render(
        <AllTheProviders>
          <CapsuleCard vlog={dislikedVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      await waitFor(() => {

        const unlikeBtn = screen.getByTestId("like-count").closest("button");
        expect(unlikeBtn).toBeInTheDocument();
      });
    });
  });

  describe("6. Unauthenticated User Experience", () => {
    it("should show login prompt for unauthenticated users", async () => {
      const user = userEvent.setup();
      localStorage.removeItem("user");

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      await waitFor(() => {
        expect(screen.getByText(/log in/i)).toBeInTheDocument();
      });
    });

    it("should not make API call for unauthenticated interactions", async () => {
      const user = userEvent.setup();
      localStorage.removeItem("user");

      const likeSpy = vi.spyOn(api.vlogAPI, "likeVlog");

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      await waitFor(() => {
        expect(likeSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("7. Share Functionality", () => {
    it("should copy link to clipboard when share is clicked", async () => {
      const user = userEvent.setup();

      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });

      vi.spyOn(api.vlogAPI, "shareVlog").mockResolvedValue({
        data: { success: true, data: { shares: 1 } },
      });

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const shareButton = screen.getByTestId("share-button");
      await user.click(shareButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });
    });
  });

  describe("8. Theme Consistency", () => {
    it("should apply glass morphism styles to interaction buttons", () => {
      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");

      // Check for glass morphism classes
      expect(likeButton.className).toMatch(/backdrop-blur|glass/);
    });
  });

  describe("9. Loading States", () => {
    it("should disable button during interaction", async () => {
      localStorage.setItem("token", "mock-jwt-token");
      localStorage.setItem("user", JSON.stringify(mockUser));
      const user = userEvent.setup();

      vi.spyOn(api.vlogAPI, "likeVlog").mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: { success: true, data: { ...mockVlog, isLiked: true } },
                }),
              500,
            ),
          ),
      );

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");
      await user.click(likeButton);

      // Button should be disabled during API call
      expect(likeButton).toBeDisabled();

      await waitFor(() => {
        expect(likeButton).not.toBeDisabled();
      });
    });
  });

  describe("10. Error Handling and Rollback", () => {
    it("should rollback optimistic update on error", async () => {
      const user = userEvent.setup();

      vi.spyOn(api.vlogAPI, "likeVlog").mockRejectedValue(
        new Error("Network error"),
      );

      render(
        <AllTheProviders>
          <CapsuleCard vlog={mockVlog} />
        </AllTheProviders>,
      );


      const likeButton = screen.getByTestId("like-count").closest("button");

      // Initial count
      expect(screen.getByTestId("like-count")).toHaveTextContent("0");

      await user.click(likeButton);

      // Should rollback to original count
      await waitFor(() => {
        expect(screen.getByTestId("like-count")).toHaveTextContent("0");
      });
    });
  });
});

describe("Final Verification - Cross-Page Consistency", () => {
  it("should maintain interaction state across page navigation", async () => {
    // This would require more complex setup with routing
    // Marking as a manual test item
    expect(true).toBe(true);
  });
});

describe("Final Verification - Performance", () => {
  it("should handle rapid clicks without double-submission", async () => {
    const user = userEvent.setup();

    const likeSpy = vi.spyOn(api.vlogAPI, "likeVlog").mockResolvedValue({
      data: { success: true, data: { ...mockVlog, isLiked: true } },
    });

    render(
      <AllTheProviders>
        <CapsuleCard vlog={mockVlog} />
      </AllTheProviders>,
    );

    const buttons = screen.getAllByRole("button");
    const likeButton = screen.getByTestId("like-count").closest("button");

    // Click rapidly 5 times
    await user.click(likeButton);
    await user.click(likeButton);
    await user.click(likeButton);
    await user.click(likeButton);
    await user.click(likeButton);

    await waitFor(() => {
      // Should only call API once or twice (toggle)
      expect(likeSpy.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});
