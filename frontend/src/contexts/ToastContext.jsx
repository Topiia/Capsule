import { createContext, useContext, useReducer, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import Toast from "../components/UI/Toast";

const ToastContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

import { toastReducer, TOAST_ACTIONS } from "../reducers/toastReducer";

export const ToastProvider = ({ children }) => {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const showToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now() + Math.random();
    dispatch({ type: TOAST_ACTIONS.SHOW, payload: { id, message, type, duration } });
    return id;
  }, []);

  const hideToast = useCallback((id) => {
    dispatch({ type: TOAST_ACTIONS.HIDE, payload: { id } });
  }, []);

  const clearAllToasts = useCallback(() => {
    dispatch({ type: TOAST_ACTIONS.CLEAR });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast, clearAllToasts }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                id={toast.id}
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={hideToast}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
