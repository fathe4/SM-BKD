// src/routes/statsRoutes.ts
import { Router } from "express";
import { StatsController } from "../controllers/statsController";
import { authenticate } from "../middlewares/authenticate";
import { canAccessProfile } from "../middlewares/canAccess";
import { UserRole } from "../types/models";

const router = Router();

/**
 * @route GET /api/v1/stats/me
 * @desc Get current user's comprehensive statistics
 * @access Private - Authenticated users only
 */
router.get(
  "/me",
  authenticate,
  StatsController.getMyStats
);

/**
 * @route GET /api/v1/stats/me/quick
 * @desc Get current user's quick statistics (lightweight)
 * @access Private - Authenticated users only
 */
router.get(
  "/me/quick",
  authenticate,
  StatsController.getMyQuickStats
);

/**
 * @route GET /api/v1/stats/user/:userId
 * @desc Get comprehensive statistics for a specific user
 * @access Private - Users can access their own stats, admins can access any
 */
router.get(
  "/user/:userId",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN, UserRole.MODERATOR]), // Users can access their own, admins can access any
  StatsController.getUserStats
);

/**
 * @route GET /api/v1/stats/user/:userId/quick
 * @desc Get quick statistics for a specific user (lightweight)
 * @access Private - Users can access their own stats, admins can access any
 */
router.get(
  "/user/:userId/quick",
  authenticate,
  canAccessProfile(true, [UserRole.ADMIN, UserRole.MODERATOR]), // Users can access their own, admins can access any
  StatsController.getQuickStats
);

export default router;
