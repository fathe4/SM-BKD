// src/middlewares/resourceAuthorization.ts
import { Request, Response, NextFunction } from "express";
import { UserRole } from "../types/models";
import { AppError } from "./errorHandler";
import { logger } from "../utils/logger";

export type ResourceOwnershipChecker = (
  resourceId: string,
  userId: string
) => Promise<boolean>;

/**
 * Universal authorization middleware for resource access
 *
 * @param paramName - The name of the request parameter containing the resource ID
 * @param checkOwnership - Function that checks if the user owns the resource
 * @param allowOwner - Allow access if the user is the resource owner
 * @param allowedRoles - Array of roles that are allowed access regardless
 */
export const canAccessResource = (
  paramName: string,
  checkOwnership: ResourceOwnershipChecker,
  allowOwner = true,
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

      // Get the resource ID from params
      const resourceId = req.params[paramName];

      if (!resourceId) {
        throw new AppError(`${paramName} is required`, 400);
      }

      // Store the resource ID in locals for controller use
      res.locals.resourceId = resourceId;

      // Check if the user has an allowed role
      const hasAllowedRole = userRole && allowedRoles.includes(userRole);

      // If user has an allowed role, grant access immediately
      if (hasAllowedRole) {
        return next();
      }

      // If we need to check resource ownership
      if (allowOwner) {
        // Check if current user is the resource owner
        const isResourceOwner = await checkOwnership(resourceId, currentUserId);

        if (isResourceOwner) {
          return next();
        }
      }

      // If we reach here, access is denied
      throw new AppError(
        "You do not have permission to access this resource",
        403
      );
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      }

      logger.error("Error in resource authorization middleware:", error);
      return res.status(500).json({
        status: "error",
        message: "Something went wrong with authorization",
      });
    }
  };
};
