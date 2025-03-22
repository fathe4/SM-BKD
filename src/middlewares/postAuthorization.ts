// src/middlewares/postAuthorization.ts
import { Request, Response, NextFunction } from "express";
import { UserRole } from "../types/models";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import { PostService } from "../services/postService";

/**
 * Authorization middleware for post access
 * @param allowPostOwner - Allow access if the user is the post owner
 * @param allowedRoles - Array of roles that are allowed access regardless
 */
export const canAccessPost = (
  allowPostOwner = true,
  allowedRoles: UserRole[] = [UserRole.ADMIN]
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get the current user's ID and role
      const currentUserId = req.user?.id;
      const userRole = req.user?.role;

      if (!currentUserId) {
        throw new AppError("Not authenticated", 401);
      }

      // Get the post ID from params
      const postId = req.params.id;

      if (!postId) {
        throw new AppError("Post ID is required", 400);
      }

      // Store the post ID in locals for controller use
      res.locals.postId = postId;

      // Check if the user has an allowed role
      const hasAllowedRole = userRole && allowedRoles.includes(userRole);

      // If user has an allowed role, grant access immediately
      if (hasAllowedRole) {
        return next();
      }

      // If we need to check post ownership
      if (allowPostOwner) {
        // Get the post to check ownership
        const post = await PostService.getPostById(postId, currentUserId);

        if (!post) {
          throw new AppError("Post not found", 404);
        }

        // Store the post in locals for controller use to avoid duplicate queries
        res.locals.post = post;

        // Check if current user is the post owner
        const isPostOwner = post.user_id === currentUserId;

        if (isPostOwner) {
          return next();
        }
      }

      // If we reach here, access is denied
      throw new AppError("You do not have permission to access this post", 403);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      }

      logger.error("Error in post authorization middleware:", error);
      return res.status(500).json({
        status: "error",
        message: "Something went wrong with authorization",
      });
    }
  };
};
