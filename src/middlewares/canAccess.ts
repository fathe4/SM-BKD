// src/middlewares/profileAuthorization.ts
import { Request, Response, NextFunction } from "express";
import { UserRole } from "../types/models";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

/**
 * @param allowSameUser - Allow access if the user is accessing their own profile
 * @param allowedRoles - Array of roles that are allowed access regardless
 */
export const canAccessProfile = (
  allowSameUser = true,
  allowedRoles: UserRole[] = [UserRole.ADMIN]
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get the current user's ID and role
      const currentUserId = req.user?.id;
      const userRole = req.user?.role;

      if (!currentUserId) {
        throw new AppError("Not authenticated", 401);
      }

      // Get the target user ID (from params or current user)
      const targetUserId = req.params.userId || currentUserId;

      // Set the targetUserId in locals for controller use
      res.locals.targetUserId = targetUserId;

      // Check if the user has an allowed role
      const hasAllowedRole = userRole && allowedRoles.includes(userRole);

      // Check if it's the same user (if allowed)
      const isSameUser = allowSameUser && currentUserId === targetUserId;

      // Grant access if either condition is true
      if (hasAllowedRole || isSameUser) {
        return next();
      }

      // Deny access if neither condition is true
      throw new AppError(
        "You do not have permission to access this profile",
        403
      );
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      }

      logger.error("Error in profile authorization middleware:", error);
      return res.status(500).json({
        status: "error",
        message: "Something went wrong with authorization",
      });
    }
  };
};
