import { Router } from "express";
import { FriendshipController } from "../controllers/friendshipController";
import { authenticate } from "../middlewares/authenticate";
import {
  validateFriendRequest,
  validateFriendshipStatus,
  validateFriendshipId,
  validateMutualFriendsRequest,
  validateFriendshipPagination,
} from "../middlewares/validators/friendshipValidator";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/v1/friendships
 * @desc Send a friend request
 * @access Private
 */
router.post("/", validateFriendRequest, FriendshipController.sendFriendRequest);

/**
 * @route GET /api/v1/friendships
 * @desc Get user's friendships with optional status filtering
 * @access Private
 */
router.get(
  "/",
  validateFriendshipPagination,
  FriendshipController.getFriendships
);

/**
 * @route GET /api/v1/friendships/suggestions
 * @desc Get friend suggestions
 * @access Private
 */
router.get("/suggestions", FriendshipController.getFriendSuggestions);

/**
 * @route GET /api/v1/friendships/mutual/:userId
 * @desc Get mutual friends with another user
 * @access Private
 */
router.get(
  "/mutual/:userId",
  validateMutualFriendsRequest,
  FriendshipController.getMutualFriends
);

/**
 * @route GET /api/v1/friendships/:id
 * @desc Get a specific friendship
 * @access Private
 */
router.get("/:id", validateFriendshipId, FriendshipController.getFriendship);

/**
 * @route PATCH /api/v1/friendships/:id
 * @desc Update friendship status (accept/reject/block)
 * @access Private
 */
router.patch(
  "/:id",
  validateFriendshipStatus,
  FriendshipController.updateFriendshipStatus
);

/**
 * @route DELETE /api/v1/friendships/:id
 * @desc Delete a friendship
 * @access Private
 */
router.delete(
  "/:id",
  validateFriendshipId,
  FriendshipController.deleteFriendship
);

export default router;
