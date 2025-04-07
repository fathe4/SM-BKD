// src/controllers/profileController.ts
import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { ProfileService } from "../services/profileService";
import { UserService } from "../services/userService";

export class ProfileController {
  /**
   * Get a user's profile
   */
  static async getProfile(req: Request, res: Response) {
    try {
      // Get the target user ID from locals or params or the authenticated user
      const userId =
        res.locals.targetUserId || req.params.userId || req.user?.id;

      if (!userId) {
        throw new AppError("User ID is required", 400);
      }

      const profile = await ProfileService.getProfile(userId);

      if (!profile) {
        throw new AppError("Profile not found", 404);
      }

      res.status(200).json({
        status: "success",
        data: {
          profile,
        },
      });
    } catch (error) {
      logger.error("Error in getProfile controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Create or update user profile
   */
  static async upsertProfile(req: Request, res: Response) {
    try {
      const userId = res.locals.targetUserId;

      // Merge the user ID with the request body
      const profileData = { ...req.body, user_id: userId };

      const profile = await ProfileService.upsertProfile(profileData);

      res.status(200).json({
        status: "success",
        data: {
          profile,
        },
      });
    } catch (error) {
      logger.error("Error in upsertProfile controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to update profile",
        });
      }
    }
  }

  /**
   * Update specific profile fields
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = res.locals.targetUserId;

      const profile = await ProfileService.updateProfile(userId, req.body);

      res.status(200).json({
        status: "success",
        data: {
          profile,
        },
      });
    } catch (error) {
      logger.error("Error in updateProfile controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to update profile",
        });
      }
    }
  }

  /**
   * Delete user profile
   */
  static async deleteProfile(req: Request, res: Response) {
    try {
      const userId = res.locals.targetUserId;

      await ProfileService.deleteProfile(userId);

      res.status(204).send();
    } catch (error) {
      logger.error("Error in deleteProfile controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to delete profile",
        });
      }
    }
  }

  /**
   * Get multiple profiles (with pagination)
   */
  static async getProfiles(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const { profiles, total } = await ProfileService.getProfiles(page, limit);

      res.status(200).json({
        status: "success",
        results: profiles.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: {
          profiles,
        },
      });
    } catch (error) {
      logger.error("Error in getProfiles controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to retrieve profiles",
        });
      }
    }
  }

  /**
   * Find a user by username
   */
  static async findByUsername(req: Request, res: Response) {
    try {
      const { username } = req.params;

      if (!username) {
        throw new AppError("Username is required", 400);
      }

      const userData = await UserService.findUserByUsernameWithProfile(
        username
      );

      if (!userData) {
        throw new AppError("User not found", 404);
      }

      res.status(200).json({
        status: "success",
        data: userData,
      });
    } catch (error) {
      logger.error("Error in findByUsername controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to find user by username",
        });
      }
    }
  }
}
