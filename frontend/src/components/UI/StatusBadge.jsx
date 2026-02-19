import './StatusBadge.css';

/**
 * StatusBadge - Display moderation status with emoji, label, and color
 * @param {string} status - One of: PENDING, APPROVED, FLAGGED, LIMITED, REJECTED
 * @param {string} className - Optional additional CSS classes
 */
const StatusBadge = ({ status, className = '' }) => {
  const statusConfig = {
    PENDING: {
      emoji: '🔄',
      label: 'Under Review',
      colorClass: 'status-pending',
    },
    APPROVED: {
      emoji: '✅',
      label: 'Published',
      colorClass: 'status-approved',
    },
    FLAGGED: {
      emoji: '⚠️',
      label: 'Under Review',
      colorClass: 'status-flagged',
    },
    LIMITED: {
      emoji: '🚫',
      label: 'Limited Visibility',
      colorClass: 'status-limited',
    },
    REJECTED: {
      emoji: '❌',
      label: 'Rejected',
      colorClass: 'status-rejected',
    },
  };

  const config = statusConfig[status] || statusConfig.PENDING;

  return (
    <span className={`status-badge ${config.colorClass} ${className}`}>
      <span className="status-emoji" aria-hidden="true">
        {config.emoji}
      </span>
      <span className="status-label">{config.label}</span>
    </span>
  );
};

export default StatusBadge;
