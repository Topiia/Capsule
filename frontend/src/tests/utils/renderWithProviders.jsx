import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { ThemeProvider } from "../../contexts/ThemeProvider";
import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../contexts/ToastContext";
import { authAPI, vlogAPI, userAPI, uploadAPI, adminAPI } from "../../services/api";

const api = { authAPI, vlogAPI, userAPI, uploadAPI, adminAPI };


/**
 * Deterministic Test Harness Wrapper
 * Phase 2 of CI Stabilization Protocol
 *
 * @param {React.ReactElement} ui - The component to render
 * @param {Object} options - Configuration for the test environment
 * @param {boolean} options.authenticated - Whether the user should be logged in
 * @param {Object} options.user - Custom user object if authenticated
 * @param {Object} options.apiMocks - Custom mocks for API functions (e.g. { vlogAPI: { likeVlog: vi.fn() } })
 * @param {string} options.route - Initial route for MemoryRouter
 */
export const renderWithProviders = (
  ui,
  {
    authenticated = false,
    user = {
      _id: "testuser123",
      username: "testuser",
      email: "test@example.com",
      role: "user",
    },
    apiMocks = {},
    route = "/",
    ...renderOptions
  } = {},
) => {
  // 1. Fresh QueryClient per test to prevent cache leakage
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0, // Prevent caching across tests
      },
      mutations: {
        retry: false,
      },
    },
  });

  // 2. Handle specific Auth State Deterministically
  if (authenticated) {
    localStorage.setItem("token", "deterministic-test-token");
    if (authAPI && authAPI.getMe) {
      vi.mocked(authAPI.getMe).mockResolvedValue({ data: { user } });
    }
  } else {
    localStorage.removeItem("token");
    if (authAPI && authAPI.getMe) {
      vi.mocked(authAPI.getMe).mockRejectedValue(new Error("Unauthenticated"));
    }
  }

  // 3. Apply custom API mock overrides provided by the test
  if (apiMocks) {
    Object.keys(apiMocks).forEach((moduleKey) => {
      const moduleMocks = apiMocks[moduleKey];
      Object.keys(moduleMocks).forEach((fnKey) => {
        if (api[moduleKey] && api[moduleKey][fnKey]) {
          api[moduleKey][fnKey].mockImplementation(
             moduleMocks[fnKey].getMockImplementation() 
             || moduleMocks[fnKey] // Support direct async functions or vi.fn()
          );
        }
      });
    });
  }

  // 4. Wrap component in all required specific providers
  const Wrapper = ({ children }) => {
    return (
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                {children}
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient, // Return client so tests can directly mutate/await cache if necessary
  };
};
