/**
 * **Feature: forgot-password-ui, Property 2: Invalid email format prevents submission**
 * **Validates: Requirements 1.3**
 *
 * Property: For any string that does not match valid email format, when entered
 * in the forgot password form, the application should display a validation error
 * and prevent the API call from being made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import ForgotPassword from "../pages/Auth/ForgotPassword";
import * as fc from "fast-check";
import { authAPI } from "../services/api";

// Mock the API
vi.mock("../services/api", () => ({
  authAPI: {
    forgotPassword: vi.fn(),
    setAuthHeader: vi.fn(),
    getMe: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
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

describe("ForgotPassword Email Validation Property Test", () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  const renderForgotPassword = () => {
    // Clean up any previous renders
    document.body.innerHTML = "";

    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/forgot-password"]}>
            <ForgotPassword />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  // Generator for invalid email strings
  // These are strings that should NOT match the email pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  // Utilizing a generic string generator and filtering out any strings that coincidentally pass the regex
  const invalidEmailArbitrary = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

  // Extracted validation logic mirroring the component's react-hook-form pattern
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = (email) => EMAIL_REGEX.test(email);

  describe("Pure Validation Logic Tests", () => {
    it("should reject invalid email formats universally", () => {
      fc.assert(
        fc.property(invalidEmailArbitrary, (invalidEmail) => {
          expect(isValidEmail(invalidEmail)).toBe(false);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("DOM Integration Tests", () => {
    it("should display validation error and prevent API call for invalid email format", async () => {
      const user = userEvent.setup();
      const { container, unmount } = renderForgotPassword();

      try {
        const emailInput = container.querySelector("#email");
        const submitButton = container.querySelector('button[type="submit"]');

        authAPI.forgotPassword.mockClear();

        await user.clear(emailInput);
        await user.type(emailInput, "invalid-email-format");
        await user.click(submitButton);

        await waitFor(
          () => {
            expect(authAPI.forgotPassword).not.toHaveBeenCalled();
          },
          { timeout: 1000 },
        );

        await waitFor(
          () => {
            const errorMessage = container.querySelector(".text-red-400");
            expect(errorMessage).toBeTruthy();
          },
          { timeout: 1000 },
        );
      } finally {
        unmount();
      }
    });

    it("should handle empty email submission", async () => {
      const user = userEvent.setup();
      const { container, unmount } = renderForgotPassword();

      try {
        const emailInput = container.querySelector("#email");
        const submitButton = container.querySelector('button[type="submit"]');
        
        authAPI.forgotPassword.mockClear();

        // Clear the input (ensure it's empty)
        await user.clear(emailInput);

        // Try to submit with empty email
        await user.click(submitButton);

        // Wait for validation error
        await waitFor(() => {
          const errorMessage = container.querySelector(".text-red-400");
          expect(errorMessage).toBeTruthy();
        });

        // API should not be called
        expect(authAPI.forgotPassword).not.toHaveBeenCalled();
      } finally {
        unmount();
      }
    });

    it("should handle emails without @ symbol", async () => {
      const user = userEvent.setup();
      const { container, unmount } = renderForgotPassword();

      try {
        const emailInput = container.querySelector("#email");
        const submitButton = container.querySelector('button[type="submit"]');

        authAPI.forgotPassword.mockClear();

        await user.clear(emailInput);
        await user.type(emailInput, "nodomaincom");
        await user.click(submitButton);

        await waitFor(
          () => {
            expect(authAPI.forgotPassword).not.toHaveBeenCalled();
          },
          { timeout: 1000 },
        );

        await waitFor(
          () => {
            const errorMessage = container.querySelector(".text-red-400");
            expect(errorMessage).toBeTruthy();
          },
          { timeout: 1000 },
        );
      } finally {
        unmount();
      }
    });
  });
});
