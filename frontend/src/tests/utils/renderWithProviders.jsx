import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../../contexts/ThemeProvider";
import { ToastProvider } from "../../contexts/ToastContext";
import { AuthContext } from "../../contexts/AuthContext";
import { Toaster } from "react-hot-toast";


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
    user = null,
    loading = false,
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

  // 2. Derive Auth State Deterministically via Context Injection (Cookie/Session Mode)
  const authContextValue = {
    isAuthenticated: authenticated,
    user: authenticated ? (user || { _id: "mock-id", username: "testuser" }) : null,
    loading: loading,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  };

  // 4. Wrap component in all required specific providers
  const Wrapper = ({ children }) => {
    return (
      <MemoryRouter initialEntries={[route]}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AuthContext.Provider value={authContextValue}>
                <Toaster />
                {children}
              </AuthContext.Provider>
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
