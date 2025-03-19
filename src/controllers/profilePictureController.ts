// src/controllers/profilePictureController.ts
import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { UserService } from "../services/userService";
import { StorageService } from "../services/storageService";
import { supabase } from "../config/supabase";

export class ProfilePictureController {
  /**
   * Upload and update a user's profile picture
   */
  static async uploadProfilePicture(req: Request, res: Response) {
    try {
      // Check if file exists in the request
      if (!req.file) {
        throw new AppError("No file uploaded", 400);
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Upload the file to Supabase Storage
      const uploadResult = await StorageService.uploadFile(
        "profile-pictures",
        req.file,
        userId // Use user ID as folder name for organization
      );

      // Update the user's profile picture in the database
      const updatedUser = await UserService.updateProfilePicture(
        userId,
        uploadResult
      );

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Profile picture updated successfully",
        data: {
          profilePicture: updatedUser.profile_picture,
        },
      });
    } catch (error) {
      logger.error("Error in uploadProfilePicture controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to upload profile picture",
        });
      }
    }
  }

  /**
   * Remove a user's profile picture
   */
  static async removeProfilePicture(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Remove the profile picture
      await UserService.removeProfilePicture(userId);

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Profile picture removed successfully",
      });
    } catch (error) {
      logger.error("Error in removeProfilePicture controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to remove profile picture",
        });
      }
    }
  }

  /**
   * Upload and update a user's cover picture
   */
  static async uploadCoverPicture(req: Request, res: Response) {
    try {
      // Check if file exists in the request
      if (!req.file) {
        throw new AppError("No file uploaded", 400);
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Upload the file to Supabase Storage
      const uploadResult = await StorageService.uploadFile(
        "cover-pictures",
        req.file,
        userId // Use user ID as folder name for organization
      );

      // Get the current user
      const currentUser = await UserService.findUserById(userId);
      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Extract the old cover picture path if it exists
      let oldPicturePath: string | null = null;
      if (currentUser.cover_picture) {
        const urlParts = currentUser.cover_picture.split("/public/");
        if (urlParts.length > 1) {
          const bucketAndPath = urlParts[1].split("/");
          if (bucketAndPath.length > 1) {
            bucketAndPath.shift();
            oldPicturePath = bucketAndPath.join("/");
          }
        }
      }

      // Update the user's cover picture in the database
      const { data, error } = await supabase
        .from("users")
        .update({
          cover_picture: uploadResult.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        throw new AppError(
          `Failed to update cover picture: ${error.message}`,
          400
        );
      }

      // Delete the old cover picture if it exists
      if (oldPicturePath) {
        try {
          await StorageService.deleteFile("cover-pictures", oldPicturePath);
        } catch (deleteError) {
          logger.warn("Failed to delete old cover picture:", deleteError);
        }
      }

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Cover picture updated successfully",
        data: {
          coverPicture: data.cover_picture,
        },
      });
    } catch (error) {
      logger.error("Error in uploadCoverPicture controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to upload cover picture",
        });
      }
    }
  }

  /**
   * Remove a user's cover picture
   */
  static async removeCoverPicture(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError("User not authenticated", 401);
      }

      // Get the current user
      const currentUser = await UserService.findUserById(userId);
      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Extract the cover picture path if it exists
      let picturePath: string | null = null;
      if (currentUser.cover_picture) {
        const urlParts = currentUser.cover_picture.split("/public/");
        if (urlParts.length > 1) {
          const bucketAndPath = urlParts[1].split("/");
          if (bucketAndPath.length > 1) {
            bucketAndPath.shift();
            picturePath = bucketAndPath.join("/");
          }
        }
      } else {
        // No cover picture to remove
        return res.status(200).json({
          status: "success",
          message: "No cover picture to remove",
        });
      }

      // Update user to remove cover picture URL
      const { error } = await supabase
        .from("users")
        .update({
          cover_picture: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        throw new AppError(
          `Failed to remove cover picture: ${error.message}`,
          400
        );
      }

      // Delete the file from storage
      if (picturePath) {
        try {
          await StorageService.deleteFile("cover-pictures", picturePath);
        } catch (deleteError) {
          logger.warn("Failed to delete cover picture file:", deleteError);
        }
      }

      // Return success response
      res.status(200).json({
        status: "success",
        message: "Cover picture removed successfully",
      });
    } catch (error) {
      logger.error("Error in removeCoverPicture controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to remove cover picture",
        });
      }
    }
  }
}
