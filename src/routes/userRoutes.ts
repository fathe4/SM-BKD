// src/routes/userRoutes.ts
import { Router } from "express";
import { UserController } from "../controllers/userController";
import { authenticate } from "../middlewares/authenticate";
import {
  validateCreateUser,
  validateUpdateUser,
  validateUserSearch,
} from "../middlewares/validators/userValidator";
import { UserRole } from "../types/models";
import { canAccessProfile } from "../middlewares/canAccess";
import { FriendshipController } from "../controllers/friendshipController";
import { validateUserId } from "../middlewares/validators/friendshipValidator";

const router = Router();

/**
 * @route GET /api/v1/users
 * @desc Get all users with pagination, filtering and search
 * @access Private - Admin only
 */
router.get(
  "/",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN, UserRole.MODERATOR]), // Only admins can access
  validateUserSearch,
  UserController.getUsers,
);

/**
 * @route GET /api/v1/users/:id
 * @desc Get a user by ID
 * @access Private - Admin or user themselves
 */
router.get(
  "/:id",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN]), // Allow own profile or admin
  UserController.getUser,
);

/**
 * @route GET /api/v1/users/:id/details
 * @desc Get a user by ID with detailed information (profile, location, marketplace, subscription)
 * @access Private - Admin or user themselves
 */
router.get(
  "/:id/details",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN]), // Allow own profile or admin
  UserController.getUserDetails,
);

/**
 * @route POST /api/v1/users
 * @desc Create a new user
 * @access Private - Admin only
 */
router.post(
  "/",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only admins can access
  validateCreateUser,
  UserController.createUser,
);

/**
 * @route PATCH /api/v1/users/:id
 * @desc Update a user
 * @access Private - Admin or user themselves
 */
router.put(
  "/:id",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN, UserRole.MODERATOR]), // Allow own profile or admin
  validateUpdateUser,
  UserController.updateUser,
);

/**
 * @route DELETE /api/v1/users/:id/complete
 * @desc Delete a user completely with all associated data
 * @access Private - Admin only
 */
router.delete(
  "/:id/complete",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only admins can access
  UserController.deleteUserCompletely,
);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Delete a user (legacy method - may fail due to foreign key constraints)
 * @access Private - Admin only
 */
router.delete(
  "/:id",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only admins can access
  UserController.deleteUser,
);

router.use(
  "/:userId/friendships",
  validateUserId,
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN, UserRole.MODERATOR]),
  FriendshipController.getUserFriendships,
);

/**
 * @route PATCH /api/v1/users/:id/password
 * @desc Change user password
 * @access Private - Admin or user themselves
 */
// router.patch(
//   "/:id/password",
//   authenticate,
//   canAccessProfile(true, [UserRole.ADMIN]), // Allow own profile or admin
//   UserController.changePassword
// );

export default router;
