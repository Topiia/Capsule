import { useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import toast from "react-hot-toast";
import AdminLayout from "../../components/Layout/AdminLayout";

const AdminUserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getAllUsers();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (error) {
      toast.error("Failed to fetch users");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Users">
        <div className="theme-text">Loading Users...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Users">
      <table className="w-full theme-table">
        <thead>
          <tr className="theme-table-header">
            <th className="p-2 text-left">Username</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Role</th>
            <th className="p-2 text-left">Trust Score</th>
            <th className="p-2 text-left">Active</th>
          </tr>
        </thead>

        <tbody>
          {users.map((user) => (
            <tr key={user._id} className="theme-table-row">
              <td className="p-2">{user.username}</td>
              <td className="p-2">{user.email}</td>
              <td className="p-2">{user.role}</td>
              <td className="p-2">{user.trustScore}</td>
              <td className="p-2">{user.isActive ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
};

export default AdminUserList;
