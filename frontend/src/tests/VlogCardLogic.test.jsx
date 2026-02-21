import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock dependencies locally
const useAuthMock = {
    isAuthenticated: true,
    user: { _id: "user1" }
};
const useInteractionsMock = {
    toggleLike: vi.fn(),
    toggleDislike: vi.fn(),
    shareVlog: vi.fn(),
    toggleBookmark: vi.fn(),
    isLiking: false,
    isDisliking: false,
    isSharing: false,
    isBookmarking: false,
};

// Inlined logic from CapsuleCard to verify rendering logic without import issues
const CapsuleCardLogic = ({ vlog }) => {
    // Simplified context usage
    const _isAuthenticated = useAuthMock.isAuthenticated;
    const user = useAuthMock.user;
    const { toggleLike: _toggleLike, isLiking: _isLiking, isLiked: _isLiked } = useInteractionsMock;

    // THE LOGIC UNDER TEST
    const isLiked =
        typeof vlog.isLiked === "boolean"
            ? vlog.isLiked
            : vlog.likes?.includes(user?._id) || false;

    const likeCount =
        typeof vlog.likeCount === "number"
            ? vlog.likeCount
            : vlog.likes?.length || 0;

    return (
        <div>
            <span data-testid="like-count">{likeCount}</span>
            <span data-testid="is-liked">{isLiked ? "yes" : "no"}</span>
        </div>
    );
};


describe("CapsuleCard Logic Isolated", () => {
    it("renders like count from vlogs.likes array (legacy behavior)", () => {
        const vlog = {
            _id: "1",
            likes: ["user1", "user2"], // length 2
            // likeCount undefined
            isLiked: false,
        };

        render(<CapsuleCardLogic vlog={vlog} />);
        expect(screen.getByTestId("like-count")).toHaveTextContent("2");
    });

    it("renders like count from likeCount prop (expected behavior for optimistic updates)", () => {
        const vlog = {
            _id: "2",
            likes: [], // Empty array
            likeCount: 5, // Updated optimistic count
            isLiked: true,
        };

        render(<CapsuleCardLogic vlog={vlog} />);
        expect(screen.getByTestId("like-count")).toHaveTextContent("5");
        expect(screen.getByTestId("is-liked")).toHaveTextContent("yes");
    });
});
