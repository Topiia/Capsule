import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import LoadingSpinner from "../UI/LoadingSpinner";

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Check if user is authenticated and has admin role
  if (!user || user.role !== "admin") {
    // Redirect to home if not admin, but keep history clean
    return <Navigate to="/" replace />;
  }

  return children;
};

export default AdminRoute;
