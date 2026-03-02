import { useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import toast from "react-hot-toast";
import AdminLayout from "../../components/Layout/AdminLayout";

const AdminAnalytics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await adminAPI.getPlatformStats();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      toast.error("Failed to fetch stats");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Platform Analytics">
        <div className="theme-text">Loading Analytics...</div>
      </AdminLayout>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <AdminLayout title="Platform Analytics">
      <div className="grid grid-cols-3 gap-6">
        <div className="p-4 rounded-lg theme-surface theme-border">
          <h2 className="theme-text-secondary">Total Users</h2>
          <p className="text-3xl font-bold theme-text">{stats.totalUsers}</p>
        </div>

        <div className="p-4 rounded-lg theme-surface theme-border">
          <h2 className="theme-text-secondary">Total Vlogs</h2>
          <p className="text-3xl font-bold theme-text">{stats.totalVlogs}</p>
        </div>

        <div className="p-4 rounded-lg theme-surface theme-border">
          <h2 className="theme-text-secondary">Active Users</h2>
          <p className="text-3xl font-bold theme-text">{stats.activeUsers}</p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;
