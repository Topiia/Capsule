import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../../contexts/ThemeProvider";
import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../contexts/ToastContext";


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

  // 2. Handle specific Auth State Deterministically via Storage Only
  if (authenticated) {
    localStorage.setItem("token", "deterministic-test-token");
  } else {
    localStorage.removeItem("token");
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
