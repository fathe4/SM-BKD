/* eslint-disable @typescript-eslint/no-namespace */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "dotenv";
import { logger } from "../utils/logger";
import { UserService } from "../services/userService";
import { UserRole } from "../types/models";

config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "fail",
        message: "Not authenticated. Please log in",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: UserRole;
    };

    // Check if user exists
    const user = await UserService.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: "fail",
        message: "User belonging to this token no longer exists",
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        status: "fail",
        message: "Your account has been deactivated",
      });
    }
    console.log(decoded.id, " decoded.id");

    // Attach user to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    logger.error("Authentication error:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid token. Please log in again",
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "fail",
        message: "Your token has expired. Please log in again",
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Something went wrong with authentication",
    });
  }
};

/**
 * Authorization middleware
 * Restricts access to specific roles
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: "fail",
        message: "Not authenticated. Please log in",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};
