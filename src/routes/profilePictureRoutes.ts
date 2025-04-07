// src/routes/profilePictureRoutes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { ProfilePictureController } from "../controllers/profilePictureController";

const router = Router();

/**
 * @route PUT /api/v1/profile-pictures
 * @desc Update profile picture with URL
 * @access Private
 */
router.put("/", authenticate, ProfilePictureController.updateProfilePictureUrl);

/**
 * @route DELETE /api/v1/profile-pictures
 * @desc Remove profile picture
 * @access Private
 */
router.delete("/", authenticate, ProfilePictureController.removeProfilePicture);

/**
 * @route PUT /api/v1/profile-pictures/cover
 * @desc Update cover picture with URL
 * @access Private
 */
router.put(
  "/cover",
  authenticate,
  ProfilePictureController.updateCoverPictureUrl
);

/**
 * @route DELETE /api/v1/profile-pictures/cover
 * @desc Remove cover picture
 * @access Private
 */
router.delete(
  "/cover",
  authenticate,
  ProfilePictureController.removeCoverPicture
);

export default router;
