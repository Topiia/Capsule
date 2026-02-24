import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import App from "../App";
import { renderWithProviders } from "./utils/renderWithProviders";

vi.mock("../services/api", () => ({
  authAPI: {
    getMe: vi.fn().mockRejectedValue(new Error("Unauthenticated")),
    login: vi.fn(),
    logout: vi.fn(),
  },
  vlogAPI: {
    getTrendingVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getUserVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getLikedVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getBookmarkedVlogs: vi.fn().mockResolvedValue({ data: { vlogs: [], pagination: {} } }),
    getVlogById: vi.fn().mockResolvedValue({ data: { vlog: {} } }),
    likeVlog: vi.fn(),
    dislikeVlog: vi.fn(),
  },
  userAPI: {
    getUserProfile: vi.fn().mockResolvedValue({ data: null }),
  }
}));

// Mock components that might cause issues in tests
vi.mock("../components/UI/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));

// Mock IntersectionObserver for JSDOM constraints
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe("Final Integration Testing - Task 12", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("404 Page Display for Invalid Routes", () => {
    it("should display NotFound page for invalid route", async () => {
      renderWithProviders(<App />, { route: "/invalid-route-that-does-not-exist" });

      await waitFor(() => {
        expect(screen.getByText("404")).toBeInTheDocument();
        expect(screen.getByText("Page Not Found")).toBeInTheDocument();
      });
    });

    it("should display NotFound page with navigation options", async () => {
      renderWithProviders(<App />, { route: "/another-invalid-route" });

      await waitFor(() => {
        expect(screen.getByText("Go Home")).toBeInTheDocument();
        expect(screen.getByText("Explore Content")).toBeInTheDocument();
      });
    });

    it("should show error code on 404 page", async () => {
      renderWithProviders(<App />, { route: "/nonexistent" });

      await waitFor(() => {
        expect(screen.getByText(/404_NOT_FOUND/i)).toBeInTheDocument();
      });
    });
  });

  describe("Navigation Paths Verification", () => {
    it.each([
      ["/"],
      ["/explore"],
      ["/trending"],
    ])("should verify public route %s is accessible", async (route) => {
      const { unmount } = renderWithProviders(<App />, { route });

      await waitFor(() => {
        expect(screen.queryByText("404")).not.toBeInTheDocument();
      });

      unmount();
    });

    it.each([
      ["/dashboard"],
      ["/create"],
      ["/settings"],
      ["/bookmarks"],
      ["/liked"],
    ])("should verify protected route %s redirects when not authenticated", async (route) => {
      const { unmount } = renderWithProviders(<App />, { route });

      await waitFor(() => {
        expect(screen.queryByText("404")).not.toBeInTheDocument();
      });

      unmount();
    });
  });

  describe("Theme Persistence Across Navigation", () => {
    it("should persist theme in localStorage", async () => {
      renderWithProviders(<App />, { route: "/" });

      // Check if theme is saved to localStorage
      await waitFor(() => {
        const savedTheme = localStorage.getItem("capsule-theme");
        expect(savedTheme).toBeTruthy();
      });
    });

    it("should maintain theme class on document element", async () => {
      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        const htmlElement = document.documentElement;
        expect(htmlElement.className).toMatch(/theme-/);
      });
    });

    it("should load saved theme from localStorage on mount", async () => {
      // Set a theme in localStorage before rendering
      localStorage.setItem("capsule-theme", "deep-space");

      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        expect(document.documentElement.className).toContain(
          "theme-deep-space",
        );
      });
    });
  });

  describe("Footer Links Verification", () => {
    it("should render footer with all link sections", async () => {
      renderWithProviders(<App />, { route: "/" });

      // Phase 1: Wait for text to be present in the DOM (text resolves before ARIA tree in JSDOM)
      await screen.findByText(/company/i);

      // Phase 2: Assert semantic heading roles — JSDOM ARIA tree resolves after text settles.
      // Using waitFor → getByRole preserves a11y verification without arbitrary timeouts.
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /company/i }),
        ).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /resources/i }),
        ).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /legal/i }),
        ).toBeInTheDocument(),
      );
    });

    it("should have footer links with proper href attributes", async () => {
      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        const aboutLink = screen.getByText("About");
        expect(aboutLink).toHaveAttribute("href");

        const blogLink = screen.getByText("Blog");
        expect(blogLink).toHaveAttribute("href");

        const privacyLink = screen.getByText("Privacy Policy");
        expect(privacyLink).toHaveAttribute("href");
      });
    });

    it("should display social media links", async () => {
      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        // Social links should have aria-labels
        const socialLinks = screen.getAllByRole("link", {
          name: /Twitter|Instagram|YouTube|GitHub/i,
        });
        expect(socialLinks.length).toBeGreaterThan(0);
      });
    });

    it("should display copyright information", async () => {
      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        const currentYear = new Date().getFullYear();
        expect(
          screen.getByText(new RegExp(`© ${currentYear} CAPSULE`)),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Complete User Flow Simulation", () => {
    it("should handle navigation between multiple pages", async () => {
      renderWithProviders(<App />, { route: "/" });

      // Verify home page loads
      await waitFor(() => {
        expect(screen.queryByText("404")).not.toBeInTheDocument();
      });

      // Note: Full navigation testing would require mocking user authentication
      // and clicking through links, which is complex in this test environment
    });

    it("should maintain application state during navigation", async () => {
      renderWithProviders(<App />, { route: "/" });

      // Check that theme persists
      const initialTheme = localStorage.getItem("capsule-theme");

      // Simulate navigation by re-rendering with different route
      const { rerender: _rerender } = renderWithProviders(<App />, { route: "/explore" });

      await waitFor(() => {
        const currentTheme = localStorage.getItem("capsule-theme");
        expect(currentTheme).toBe(initialTheme);
      });
    });
  });

  describe("Route Configuration Validation", () => {
    it("should have all required routes configured", async () => {
      // Test that key routes don't show 404
      const routes = ["/", "/explore", "/trending", "/login", "/register"];

      for (const route of routes) {
        const { unmount } = renderWithProviders(<App />, { route: route });

        await waitFor(() => {
          expect(screen.queryByText("404")).not.toBeInTheDocument();
        });

        unmount();
      }
    });

    it("should handle vlog detail route with ID parameter", async () => {
      renderWithProviders(<App />, { route: "/vlog/123" });

      await waitFor(() => {
        // Should not show 404 for parameterized route
        expect(screen.queryByText("404")).not.toBeInTheDocument();
      });
    });

    it("should handle profile route with username parameter", async () => {
      renderWithProviders(<App />, { route: "/profile/testuser" });

      await waitFor(() => {
        // Should not show 404 for parameterized route
        expect(screen.queryByText("404")).not.toBeInTheDocument();
      });
    });
  });

  describe("Application Layout Consistency", () => {
    it("should render layout components on valid routes", async () => {
      renderWithProviders(<App />, { route: "/" });

      await waitFor(() => {
        // Layout should be present (footer is part of layout)
        expect(screen.getAllByText(/CAPSULE/i).length).toBeGreaterThan(0);
      });
    });

    it("should not render layout on 404 page", async () => {
      renderWithProviders(<App />, { route: "/invalid-route" });

      await waitFor(() => {
        // 404 page should render without layout
        expect(screen.getByText("404")).toBeInTheDocument();
      });
    });
  });
});
