import { Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Suspense, lazy } from "react";

// Layout Components
import Layout from "./components/Layout/Layout";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import LoadingSpinner from "./components/UI/LoadingSpinner";

// Lazy load pages for better performance
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Auth/Login"));
const Register = lazy(() => import("./pages/Auth/Register"));
const ForgotPassword = lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/Auth/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const CreateCapsule = lazy(() => import("./pages/CreateCapsule"));
const EditCapsule = lazy(() => import("./pages/EditCapsule"));
const CapsuleDetail = lazy(() => import("./pages/CapsuleDetail"));
const Explore = lazy(() => import("./pages/Explore"));
const Trending = lazy(() => import("./pages/Trending"));
const Settings = lazy(() => import("./pages/Settings"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const Likes = lazy(() => import("./pages/Likes"));
const NotFound = lazy(() => import("./pages/NotFound"));

function App() {
  return (
    <AnimatePresence mode="wait">
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <LoadingSpinner size="large" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Public Routes */}
            <Route index element={<Home />} />
            <Route path="explore" element={<Explore />} />
            <Route path="trending" element={<Trending />} />
            <Route path="vlog/:id" element={<CapsuleDetail />} />
            <Route
              path="vlog/:id/edit"
              element={
                <ProtectedRoute>
                  <EditCapsule />
                </ProtectedRoute>
              }
            />
            <Route path="profile/:username" element={<Profile />} />

            {/* Auth Routes */}
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password/:token" element={<ResetPassword />} />

            {/* Protected Routes */}
            <Route
              path="dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="create"
              element={
                <ProtectedRoute>
                  <CreateCapsule />
                </ProtectedRoute>
              }
            />

            <Route
              path="edit/:id"
              element={
                <ProtectedRoute>
                  <CreateCapsule editMode={true} />
                </ProtectedRoute>
              }
            />

            <Route
              path="settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            <Route
              path="bookmarks"
              element={
                <ProtectedRoute>
                  <Bookmarks />
                </ProtectedRoute>
              }
            />

            <Route
              path="liked"
              element={
                <ProtectedRoute>
                  <Likes />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

export default App;
