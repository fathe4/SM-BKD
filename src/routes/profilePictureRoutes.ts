// src/routes/profilePictureRoutes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { ProfilePictureController } from "../controllers/profilePictureController";
import {
  uploadProfilePicture,
  uploadCoverPicture,
} from "../middlewares/fileUpload";

const router = Router();

/**
 * @route POST /api/v1/profile-pictures
 * @desc Upload a profile picture
 * @access Private
 */
router.post(
  "/",
  authenticate,
  uploadProfilePicture,
  ProfilePictureController.uploadProfilePicture
);

/**
 * @route DELETE /api/v1/profile-pictures
 * @desc Remove profile picture
 * @access Private
 */
router.delete("/", authenticate, ProfilePictureController.removeProfilePicture);

/**
 * @route POST /api/v1/profile-pictures/cover
 * @desc Upload a cover picture
 * @access Private
 */
router.post(
  "/cover",
  authenticate,
  uploadCoverPicture,
  ProfilePictureController.uploadCoverPicture
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
