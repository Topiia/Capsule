import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import "./styles/globals.css";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: "var(--glass-white)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid var(--glass-border)",
                    color: "var(--theme-text)",
                    borderRadius: "12px",
                    padding: "16px",
                  },
                  success: {
                    iconTheme: {
                      primary: "var(--theme-accent)",
                      secondary: "var(--theme-text)",
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: "#ef4444",
                      secondary: "var(--theme-text)",
                    },
                  },
                }}
              />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
