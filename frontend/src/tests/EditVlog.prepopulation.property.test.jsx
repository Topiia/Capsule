import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import EditCapsule from "../pages/EditCapsule";
import { mapVlogToFormData } from "../utils/vlogTransformers";
import * as fc from "fast-check";
import { vlogAPI, authAPI } from "../services/api";

// Mock API for integration tests: MUST be at top level
vi.mock("../services/api", () => ({
  vlogAPI: { getVlog: vi.fn(), updateVlog: vi.fn() },
  uploadAPI: { uploadMultiple: vi.fn() },
  authAPI: { setAuthHeader: vi.fn(), getMe: vi.fn() },
}));

describe("Layer A: EditVlog Pure State Transformations", () => {
  // Generator for MongoDB ObjectId (24 character hex string)
  const objectIdArbitrary = fc
    .array(fc.integer({ min: 0, max: 15 }), { minLength: 24, maxLength: 24 })
    .map((arr) => arr.map((n) => n.toString(16)).join(""));

  const validVlogArbitrary = fc.record({
    _id: objectIdArbitrary,
    title: fc.string(),
    description: fc.string(),
    content: fc.option(fc.string(), { nil: undefined }),
    category: fc.constantFrom("technology", "travel", "lifestyle", "food", "other"),
    tags: fc.option(fc.array(fc.string()), { nil: undefined }),
    images: fc.option(fc.array(fc.record({ url: fc.webUrl() })), { nil: undefined }),
    isPublic: fc.option(fc.boolean(), { nil: undefined }),
  });

  it("should map any vlog perfectly to the target form data shape", () => {
    fc.assert(
      fc.property(validVlogArbitrary, (vlog) => {
        const formData = mapVlogToFormData(vlog);

        // Core Invariants
        // 1. Never return undefined for text fields; fallback to empty string
        expect(formData.title).toBe(vlog.title || "");
        expect(formData.description).toBe(vlog.description || "");
        expect(formData.content).toBe(vlog.content || "");
        expect(formData.category).toBe(vlog.category || "");

        // 2. Tags should always be joined safely or empty string
        if (Array.isArray(vlog.tags)) {
          expect(formData.tags).toBe(vlog.tags.join(", "));
        } else {
          expect(formData.tags).toBe("");
        }

        // 3. Fallbacks should handle booleans and arrays cleanly without throwing
        expect(formData.isPublic).toBe(vlog.isPublic ?? true);
        expect(formData.images).toEqual(vlog.images || []);
      }),
      { numRuns: 100 }
    );
  });

  it("should handle completely empty null/undefined inputs", () => {
    expect(mapVlogToFormData(null)).toBeNull();
    expect(mapVlogToFormData(undefined)).toBeNull();
  });
});

describe("Layer C: EditVlog Form Pre-population DOM Integration", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const mockVlog = {
    _id: "60d21b4667d0d8992e610c85",
    title: "Deterministic UI Test Vlog",
    description: "This is a deterministic test for the DOM prepopulation.",
    content: "Content section goes here.",
    category: "technology",
    tags: ["react", "testing"],
    isPublic: false,
    images: [],
    author: { _id: "60d21b4667d0d8992e610c85", username: "testuser" }
  };

  it("should faithfully render the mapped form data into the DOM inputs", async () => {
    authAPI.getMe.mockResolvedValue({ data: { user: { id: mockVlog.author._id } } });
    vlogAPI.getVlog.mockResolvedValue({ data: { data: mockVlog } });
    global.localStorage = { getItem: vi.fn().mockReturnValue("token"), setItem: vi.fn() };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/vlog/${mockVlog._id}/edit`]}>
            <Routes>
              <Route path="/vlog/:id/edit" element={<EditCapsule />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // Wait for auth initialization to fully commit before asserting form values.
    // AuthProvider.getMe() is async; the auth-ready sentinel appears only after loading=false,
    // preventing EditCapsule's useEffect auth-check redirect from firing mid-assertion.
    await screen.findByTestId("auth-ready");

    // Assert Form population - wait for React Hook Form to set data
    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toHaveValue("Deterministic UI Test Vlog");
    });

    expect(screen.getByLabelText(/description/i)).toHaveValue(mockVlog.description);
    expect(screen.getByLabelText(/content/i)).toHaveValue(mockVlog.content);
    expect(screen.getByLabelText(/category/i)).toHaveValue(mockVlog.category);
    expect(screen.getByLabelText(/tags/i)).toHaveValue("react, testing");

    // Public/Private Radio validation
    const privateRadio = screen.getByDisplayValue("false");
    expect(privateRadio).toBeChecked();
  });
});
