// src/controllers/profilePictureController.ts
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { UserService } from "../services/userService";
import { controllerHandler } from "../utils/controllerHandler";

export class ProfilePictureController {
  /**
   * Update a user's profile picture URL
   */
  static updateProfilePictureUrl = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      const { pictureUrl } = req.body;
      if (!pictureUrl) {
        throw new AppError("Picture URL is required", 400);
      }

      // Update the user's profile picture URL in the database
      const updatedUser = await UserService.updateProfilePictureUrl(
        userId,
        pictureUrl,
      );

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Profile picture updated successfully",
        data: {
          profilePicture: updatedUser.profile_picture,
        },
      });
    },
  );

  /**
   * Remove a user's profile picture
   */
  static removeProfilePicture = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Remove the profile picture
      await UserService.removeProfilePictureUrl(userId);

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Profile picture removed successfully",
      });
    },
  );

  /**
   * Update a user's cover picture URL
   */
  static updateCoverPictureUrl = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      const { pictureUrl } = req.body;
      if (!pictureUrl) {
        throw new AppError("Picture URL is required", 400);
      }

      // Update the user's cover picture URL in the database
      const updatedUser = await UserService.updateCoverPictureUrl(
        userId,
        pictureUrl,
      );

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Cover picture updated successfully",
        data: {
          coverPicture: updatedUser.cover_picture,
        },
      });
    },
  );

  /**
   * Remove a user's cover picture
   */
  static removeCoverPicture = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Remove the cover picture
      await UserService.removeCoverPictureUrl(userId);

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Cover picture removed successfully",
      });
    },
  );
}
