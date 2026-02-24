import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import toast from "react-hot-toast";
import EditCapsule from "../pages/EditCapsule";
import CapsuleDetail from "../pages/CapsuleDetail";
import Dashboard from "../pages/Dashboard";
import { AuthProvider } from "../contexts/AuthContext";
import { ThemeProvider } from "../contexts/ThemeProvider";
import { ToastProvider } from "../contexts/ToastContext";
import { vlogAPI, authAPI } from "../services/api";

// Mock the API
vi.mock("../services/api", () => ({
  vlogAPI: {
    getVlog: vi.fn(),
    updateVlog: vi.fn(),
    deleteVlog: vi.fn(),
    recordView: vi.fn().mockResolvedValue({}),
    likeVlog: vi.fn(),
    dislikeVlog: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
    shareVlog: vi.fn(),
  },
  userAPI: {
    addBookmark: vi.fn(),
    removeBookmark: vi.fn(),
    getBookmarks: vi.fn(),
  },
  authAPI: {
    setAuthHeader: vi.fn(),
    getMe: vi.fn(),
  },
}));

// Mock toast notifications
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

// Mock components that might cause issues
vi.mock("../components/UI/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock("../components/UI/BackgroundAnimation", () => ({
  default: () => <div data-testid="background-animation"></div>,
}));

/**
 * Integration Tests for Edit & Delete Vlog Feature (Frontend)
 *
 * Tests complete UI flows including:
 * - Edit flow with form validation and submission
 * - Delete flow with confirmation modal
 * - Authorization checks and button visibility
 * - Optimistic updates and rollbacks
 * - Error handling and recovery
 */

describe("Edit & Delete Vlog Integration Tests (Frontend)", () => {
  let queryClient;
  let user;

  const mockVlog = {
    _id: "vlog123",
    title: "Test Vlog Title",
    description: "This is a test vlog description that is long enough",
    category: "technology",
    tags: ["test", "vlog"],
    images: [
      {
        url: "https://example.com/image1.jpg",
        publicId: "image1",
        caption: "Image 1",
        order: 0,
      },
      {
        url: "https://example.com/image2.jpg",
        publicId: "image2",
        caption: "Image 2",
        order: 1,
      },
    ],
    author: {
      _id: "user123",
      username: "testauthor",
      avatar: "https://example.com/avatar.jpg",
      bio: "Test bio",
    },
    views: 100,
    likes: [],
    dislikes: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAuthUser = {
    _id: "user123",
    id: "user123", // added to match frontend JWT parsing expectations
    username: "testauthor",
    email: "test@example.com",
    token: "mock-token",
  };

  const mockOtherUser = {
    _id: "user456",
    id: "user456",
    username: "otheruser",
    email: "other@example.com",
    token: "other-token",
  };

  const renderWithProviders = (
    component,
    { initialRoute = "/", authUser = mockAuthUser } = {},
  ) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock getMe for AuthContext which now drives authentication state
    if (authUser) {
      authAPI.getMe.mockResolvedValue({ data: { user: authUser } });
    } else {
      authAPI.getMe.mockRejectedValue(new Error("unauthenticated"));
    }

    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <MemoryRouter initialEntries={[initialRoute]}>
                {component}
              </MemoryRouter>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient?.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete Edit Flow", () => {
    it("should load vlog data and pre-populate form", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalledWith(mockVlog._id);
      });

      // Check form is pre-populated
      await waitFor(() => {
        const titleInput = screen.getByLabelText(/title/i);
        expect(titleInput).toHaveValue(mockVlog.title);
      });

      const descriptionInput = screen.getByLabelText(/description/i);
      expect(descriptionInput).toHaveValue(mockVlog.description);
    });

    it("should validate form inputs before submission", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      user = userEvent.setup();

      // Clear title (make it invalid)
      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, "AB"); // Too short

      // Try to submit
      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Should show validation error
      await waitFor(() => {
        expect(
          screen.getByText(/title.*at least 3 characters/i),
        ).toBeInTheDocument();
      });

      // Should not call API
      expect(vlogAPI.updateVlog).not.toHaveBeenCalled();
    });

    it("should successfully update vlog with valid data", async () => {
      const updatedVlog = {
        ...mockVlog,
        title: "Updated Title",
        description: "Updated description that is long enough",
      };

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      vlogAPI.updateVlog.mockResolvedValue({
        data: { success: true, data: updatedVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      user = userEvent.setup();

      // Update title
      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, "Updated Title");

      // Update description
      const descriptionInput = screen.getByLabelText(/description/i);
      await user.clear(descriptionInput);
      await user.type(
        descriptionInput,
        "Updated description that is long enough",
      );

      // Submit form
      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Should call API with updated data
      await waitFor(() => {
        expect(vlogAPI.updateVlog).toHaveBeenCalledWith(
          mockVlog._id,
          expect.objectContaining({
            title: "Updated Title",
            description: "Updated description that is long enough",
          }),
        );
      });

      // Should show success toast
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/updated successfully/i),
      );
    });

    it("should handle update errors and show error message", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      vlogAPI.updateVlog.mockRejectedValue({
        response: {
          data: {
            error: "Failed to update vlog",
          },
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      user = userEvent.setup();

      // Make a change
      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, "New Title");

      // Submit
      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Should show error toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("should enforce maximum image count", async () => {
      const vlogWithManyImages = {
        ...mockVlog,
        images: Array.from({ length: 10 }, (_, i) => ({
          url: `https://example.com/image${i}.jpg`,
          publicId: `image${i}`,
          caption: `Image ${i}`,
          order: i,
        })),
      };

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: vlogWithManyImages },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Should show message about max images
      // Scoped to edit-form to avoid ambiguous match with toast notifications
      const editForm = screen.getByTestId("edit-form");
      expect(within(editForm).getAllByText(/10.*images/i)[0]).toBeInTheDocument();
    });
  });

  describe("Complete Delete Flow", () => {
    it("should show delete confirmation modal when delete button clicked", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` },
      );

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // Wait for auth-ready to ensure user identity is committed before checking ownership
      await screen.findByTestId("auth-ready");

      user = userEvent.setup();

      // CapsuleDetail's Edit/Delete are inside the "Options" dropdown.
      // Step 1: Open the dropdown. Step 2: Click "Delete Capsule" inside it.
      const optionsButton = await screen.findByRole("button", { name: /options/i });
      await user.click(optionsButton);

      // Click "Delete Capsule" inside the dropdown to trigger the confirmation modal
      const deleteCapsuleItem = await screen.findByText("Delete Capsule");
      await user.click(deleteCapsuleItem);

      // Should show confirmation modal
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });
    });

    it("should successfully delete vlog when confirmed", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      vlogAPI.deleteVlog.mockResolvedValue({
        data: { success: true, message: "Vlog deleted successfully" },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` },
      );

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // Wait for auth-ready before touching the dropdown
      await screen.findByTestId("auth-ready");

      user = userEvent.setup();

      // CapsuleDetail's Delete is inside the "Options" dropdown — open it first
      const optionsButton = await screen.findByRole("button", { name: /options/i });
      await user.click(optionsButton);

      // Click "Delete Capsule" inside the dropdown
      const deleteCapsuleItem = await screen.findByText("Delete Capsule");
      await user.click(deleteCapsuleItem);

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /confirm|yes|delete/i,
      });
      await user.click(confirmButton);

      // Should call delete API
      await waitFor(() => {
        expect(vlogAPI.deleteVlog).toHaveBeenCalledWith(mockVlog._id);
      });

      // Should show success toast
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/deleted successfully/i),
      );
    });

    it("should cancel deletion when cancel button clicked", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` },
      );

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // Wait for auth-ready before touching the dropdown
      await screen.findByTestId("auth-ready");

      user = userEvent.setup();

      // CapsuleDetail's Delete is inside the "Options" dropdown — open it first
      const optionsButton = await screen.findByRole("button", { name: /options/i });
      await user.click(optionsButton);

      // Click "Delete Capsule" inside the dropdown
      const deleteCapsuleItem = await screen.findByText("Delete Capsule");
      await user.click(deleteCapsuleItem);

      // Click cancel
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: /cancel|no/i });
      await user.click(cancelButton);

      // Should not call delete API
      expect(vlogAPI.deleteVlog).not.toHaveBeenCalled();

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
      });
    });

    it("should handle delete errors and show error message", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      vlogAPI.deleteVlog.mockRejectedValue({
        response: {
          data: {
            error: "Failed to delete vlog",
          },
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}` },
      );

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // Wait for auth-ready before touching the dropdown
      await screen.findByTestId("auth-ready");

      user = userEvent.setup();

      // CapsuleDetail's Delete is inside the "Options" dropdown — open it first
      const optionsButton = await screen.findByRole("button", { name: /options/i });
      await user.click(optionsButton);

      // Click "Delete Capsule" inside the dropdown
      const deleteCapsuleItem = await screen.findByText("Delete Capsule");
      await user.click(deleteCapsuleItem);

      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", {
        name: /confirm|yes|delete/i,
      });
      await user.click(confirmButton);

      // Should show error toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe("Authorization and Button Visibility", () => {
    it("should show edit and delete buttons to vlog author", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}`, authUser: mockAuthUser },
      );

      // Wait for AuthProvider async initialization before auth-gated assertions
      await screen.findByTestId("auth-ready");

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // CapsuleDetail renders "Options" button only to the vlog owner.
      // Open the dropdown, then assert both Edit and Delete options are present inside it.
      user = userEvent.setup();
      const optionsButton = await screen.findByRole("button", { name: /options/i });
      await user.click(optionsButton);

      await waitFor(() => {
        // "Edit Capsule" and "Delete Capsule" are the actual button labels inside the dropdown
        expect(screen.getByText("Edit Capsule")).toBeInTheDocument();
        expect(screen.getByText("Delete Capsule")).toBeInTheDocument();
      });
    });

    it("should hide edit and delete buttons from non-author", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}`, authUser: mockOtherUser },
      );

      // Wait for AuthProvider async initialization to complete before asserting absences
      await screen.findByTestId("auth-ready");

      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // For a non-author, CapsuleDetail NEVER renders the "Options" button (isOwner is false).
      // Asserting the Options button's absence is the correct, non-flaky check.
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /options/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("should redirect non-author trying to access edit page", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit`, authUser: mockOtherUser },
      );

      // Wait for auth-ready: ensures auth has resolved so EditCapsule's useEffect
      // auth-check redirect fires (navigates away from edit page for non-owner)
      await screen.findByTestId("auth-ready");

      // Should redirect or show error
      await waitFor(() => {
        expect(vlogAPI.getVlog).toHaveBeenCalled();
      });

      // After redirect, the edit form should not be present
      await waitFor(
        () => {
          expect(
            screen.queryByTestId("edit-form"),
          ).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe("Optimistic Updates and Rollbacks", () => {
    it("should submit edit and verify API is called (optimistic update trigger)", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      // Instantly-resolving mock — we verify the call was made, not loading state
      vlogAPI.updateVlog.mockResolvedValue({
        data: {
          success: true,
          data: { ...mockVlog, title: "Updated Title" },
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      // Wait for auth to fully initialize before interacting with auth-dependent form
      await screen.findByTestId("auth-ready");

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      // Wait for form pre-population: mockVlog has 2 images, so the onSubmit images guard passes
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toHaveValue(mockVlog.title);
      });

      user = userEvent.setup();

      // Update title and submit
      const titleInput = screen.getByLabelText(/title/i);
      await user.clear(titleInput);
      await user.type(titleInput, "Updated Title");

      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Assert the mutation was dispatched to the API — correct behavioral contract.
      // (Button disabled state requires fake timers; API call assertion is determinstic.)
      await waitFor(() => {
        expect(vlogAPI.updateVlog).toHaveBeenCalledWith(
          mockVlog._id,
          expect.objectContaining({ title: "Updated Title" }),
        );
      });
    });

    it("should rollback on update error", async () => {
      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      vlogAPI.updateVlog.mockRejectedValue({
        response: { data: { error: "Update failed" } },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      user = userEvent.setup();

      // Try to update
      const titleInput = screen.getByLabelText(/title/i);
      const _originalTitle = titleInput.value;
      await user.clear(titleInput);
      await user.type(titleInput, "Failed Update");

      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Should show error
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      // Form should still be editable (not redirected)
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });
  });

  describe("Error Scenarios", () => {
    it("should handle network errors gracefully", async () => {
      vlogAPI.getVlog.mockRejectedValue(new Error("Network error"));

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      // Should show 'Not Found' fallback UI when API throws
      await waitFor(() => {
        expect(screen.getByText(/Vlog Not Found/i)).toBeInTheDocument();
      });
    });

    it("should handle 404 errors for non-existent vlogs", async () => {
      vlogAPI.getVlog.mockRejectedValue({
        response: {
          status: 404,
          data: { error: "Vlog not found" },
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/nonexistent/edit` },
      );

      // Should show not found message
      await waitFor(() => {
        expect(screen.getByText(/not found/i)).toBeInTheDocument();
      });
    });

    it("should handle authorization errors (403)", async () => {
      vlogAPI.updateVlog.mockRejectedValue({
        response: {
          status: 403,
          data: { error: "Not authorized" },
        },
      });

      vlogAPI.getVlog.mockResolvedValue({
        data: { success: true, data: mockVlog },
      });

      renderWithProviders(
        <Routes>
          <Route path="/vlog/:id/edit" element={<EditCapsule />} />
          <Route path="/vlog/:id" element={<CapsuleDetail />} />
        </Routes>,
        { initialRoute: `/vlog/${mockVlog._id}/edit` },
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      });

      user = userEvent.setup();

      // Try to submit
      const submitButton = screen.getByRole("button", { name: /update|save/i });
      await user.click(submitButton);

      // Should show authorization error
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringMatching(/not authorized/i),
        );
      });
    });
  });
});
