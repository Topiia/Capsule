import { useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import toast from "react-hot-toast";

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
    return <div className="p-6">Loading Analytics...</div>;
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Platform Analytics</h1>

      <div className="grid grid-cols-3 gap-6">
        <div className="border p-4 rounded">
          <h2>Total Users</h2>
          <p className="text-3xl font-bold">{stats.totalUsers}</p>
        </div>

        <div className="border p-4 rounded">
          <h2>Total Vlogs</h2>
          <p className="text-3xl font-bold">{stats.totalVlogs}</p>
        </div>

        <div className="border p-4 rounded">
          <h2>Active Users</h2>
          <p className="text-3xl font-bold">{stats.activeUsers}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
