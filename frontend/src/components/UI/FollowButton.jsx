import { useFollowUser } from '../../hooks/useFollowUser';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import Button from './Button';

const FollowButton = ({ userId, username, variant = 'default', className = '' }) => {
  const { followUser, unfollowUser, isFollowing: isFollowingLoading, isUnfollowing } = useFollowUser();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Don't show button for own profile
  if (user?._id === userId) return null;

  // Read current user from cache to get following list
  const currentUser = queryClient.getQueryData(['currentUser']);
  
  // Compute isFollowing from cache instead of props
  const isFollowing = currentUser?.following?.includes(userId) || false;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isFollowing) {
      unfollowUser(userId);
    } else {
      followUser(userId);
    }
  };

  const isLoading = isFollowingLoading || isUnfollowing;

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      variant={isFollowing ? 'secondary' : 'primary'}
      className={`${isFollowing ? 'active-follow-indicator' : ''} ${className}`}
    >
      {isLoading ? 'Loading...' : isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
};

export default FollowButton;
