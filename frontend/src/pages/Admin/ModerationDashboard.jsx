import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI } from "../../services/api";
import { toast } from "react-hot-toast";
import StatusBadge from "../../components/UI/StatusBadge";
import LoadingSpinner from "../../components/UI/LoadingSpinner";
import AdminLayout from "../../components/Layout/AdminLayout";
import { formatDistanceToNow } from "date-fns";
import { FiCheck, FiX } from "react-icons/fi";

const ModerationDashboard = () => {
  const [vlogs, setVlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFlaggedVlogs();
  }, []);

  const fetchFlaggedVlogs = async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getFlaggedVlogs();
      if (data.success) {
        setVlogs(data.data);
      }
    } catch (error) {
      toast.error("Failed to fetch moderation queue");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (id, status, e) => {
    // Prevent navigation when clicking buttons
    e.stopPropagation();
    
    if (!window.confirm(`Are you sure you want to ${status} this vlog?`)) return;

    try {
      setProcessingId(id);
      const reason = prompt("Enter a reason for this decision (optional):") || "Admin Review";
      
      const { data } = await adminAPI.overrideDecision(id, status, reason);

      if (data.success) {
        toast.success(`Vlog ${status.toLowerCase()} successfully`);
        // Remove from list
        setVlogs((prev) => prev.filter((vlog) => vlog._id !== id));
      }
    } catch (error) {
      toast.error(error.message || "Failed to update status");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Moderation Dashboard">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="large" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Moderation Dashboard">
      <p className="theme-text-secondary">
        Review flagged content below. Your decision is final.
      </p>

      {vlogs.length === 0 ? (
        <div className="theme-surface-elevated rounded-lg shadow p-8 text-center">
          <div className="text-green-500 text-5xl mb-4 mx-auto w-fit">
            <FiCheck />
          </div>
          <h2 className="text-xl font-semibold mb-2 theme-text">All Caught Up!</h2>
          <p className="theme-text-secondary">No content currently requires moderation.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {vlogs.map((vlog) => (
            <div
              key={vlog._id}
              onClick={() => navigate(`/vlog/${vlog._id}`)}
              className="theme-surface-elevated rounded-xl shadow-lg overflow-hidden theme-border flex flex-col cursor-pointer hover:shadow-xl transition-shadow"
            >
              {/* Media Preview */}
              <div className="relative h-48 theme-surface flex items-center justify-center">
                 {/* Quick hack for video preview if thumbnail exists */}
                 {vlog.thumbnailUrl ? (
                    <img src={vlog.thumbnailUrl} alt={vlog.title} className="w-full h-full object-cover" />
                 ) : (
                     <div className="theme-text-secondary">No Preview</div>
                 )}
                 <div className="absolute top-2 right-2">
                    <StatusBadge status={vlog.status} />
                 </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg theme-text line-clamp-1">{vlog.title}</h3>
                </div>
                
                <p className="text-sm theme-text-secondary mb-4 line-clamp-2">
                    {vlog.description || "No description"}
                </p>

                {/* AI Insights - Only show high level info */}
                <div className="theme-surface p-3 rounded-lg text-sm mb-4 space-y-1">
                    <div className="flex justify-between">
                        <span className="theme-text-secondary">AI Score:</span>
                        <span className={`font-mono font-bold ${vlog.moderation?.score > 60 ? 'text-red-500' : 'text-yellow-500'}`}>
                            {vlog.moderation?.score || 0}
                        </span>
                    </div>
                     <div className="flex justify-between">
                        <span className="theme-text-secondary">Author Trust:</span>
                        <span className="font-medium theme-text">
                            {vlog.author?.trustScore || 50}
                        </span>
                    </div>
                    <div className="text-xs theme-text-secondary mt-1">
                        Posted {formatDistanceToNow(new Date(vlog.createdAt), { addSuffix: true })}
                    </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-3">
                    <button
                        onClick={(e) => handleDecision(vlog._id, "REJECTED", e)}
                        disabled={processingId === vlog._id}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                        <FiX /> Reject
                    </button>
                    <button
                        onClick={(e) => handleDecision(vlog._id, "APPROVED", e)}
                        disabled={processingId === vlog._id}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                        <FiCheck /> Approve
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default ModerationDashboard;
