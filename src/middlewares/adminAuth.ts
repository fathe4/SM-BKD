import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { UserRole } from "../types/models";

/**
 * Middleware to check if user has admin privileges
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated (this should be called after authenticate middleware)
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    // Check if user has admin role
    const adminRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MODERATOR];
    if (!adminRoles.includes(req.user.role as UserRole)) {
      throw new AppError("Admin privileges required", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has super admin privileges
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    // Check if user has super admin role
    if (req.user.role !== UserRole.SUPER_ADMIN) {
      throw new AppError("Super admin privileges required", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has moderator or higher privileges
 */
export const requireModerator = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    // Check if user has moderator, admin, or super admin role
    const moderatorRoles = [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!moderatorRoles.includes(req.user.role as UserRole)) {
      throw new AppError("Moderator privileges required", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Flexible role checker - accepts array of allowed roles
 */
export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new AppError("Authentication required", 401);
      }

      // Check if user has any of the allowed roles
      if (!allowedRoles.includes(req.user.role as UserRole)) {
        throw new AppError(`Access denied. Required roles: ${allowedRoles.join(', ')}`, 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
