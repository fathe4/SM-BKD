// src/routes/profileRoutes.ts
import { Router } from "express";
import { ProfileController } from "../controllers/profileController";
import { authenticate } from "../middlewares/authenticate";
import { canAccessProfile } from "../middlewares/canAccess";
import { UserRole } from "../types/models";
import { validateProfileUpdate } from "../middlewares/validators";

const router = Router();

/**
 * @route GET /api/v1/profiles
 * @desc Get multiple profiles with pagination
 * @access Public
 */
router.get("/", ProfileController.getProfiles);

/**
 * @route GET /api/v1/profiles/me
 * @desc Get current user's profile
 * @access Private
 */
router.get(
  "/me",
  authenticate,
  canAccessProfile(true), // Allow own profile access
  ProfileController.getProfile
);

/**
 * @route GET /api/v1/profiles/:userId
 * @desc Get a specific user's profile
 * @access Public for self and admin/moderator for others
 */
router.get(
  "/:userId",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN, UserRole.MODERATOR]), // Allow own profile or admin/moderator
  ProfileController.getProfile
);

/**
 * @route PUT /api/v1/profiles
 * @desc Update current user's profile
 * @access Private - Own profile only
 */
router.put(
  "/",
  authenticate,
  canAccessProfile(true, []), // Only allow own profile
  validateProfileUpdate,
  ProfileController.upsertProfile
);

/**
 * @route PATCH /api/v1/profiles
 * @desc Update specific profile fields
 * @access Private - Own profile only
 */
router.patch(
  "/",
  authenticate,
  canAccessProfile(true, []), // Only allow own profile
  validateProfileUpdate,
  ProfileController.updateProfile
);

/**
 * @route DELETE /api/v1/profiles
 * @desc Delete current user's profile
 * @access Private - Own profile only
 */
router.delete(
  "/",
  authenticate,
  canAccessProfile(true, []), // Only allow own profile
  ProfileController.deleteProfile
);

/**
 * ADMIN ROUTES
 */

/**
 * @route PUT /api/v1/profiles/:userId
 * @desc Update any user's profile (Admin only)
 * @access Admin
 */
router.put(
  "/:userId",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only allow admin, not same user
  validateProfileUpdate,
  ProfileController.upsertProfile
);

/**
 * @route PATCH /api/v1/profiles/:userId
 * @desc Update specific fields of any user's profile (Admin only)
 * @access Admin
 */
router.patch(
  "/:userId",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only allow admin, not same user
  validateProfileUpdate,
  ProfileController.updateProfile
);

/**
 * @route DELETE /api/v1/profiles/:userId
 * @desc Delete any user's profile (Admin only)
 * @access Admin
 */
router.delete(
  "/:userId",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN]), // Only allow admin, not same user
  ProfileController.deleteProfile
);

export default router;
