// src/middlewares/socketAuth.ts
import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "dotenv";
import { logger } from "../utils/logger";
import { UserService } from "../services/userService";
import { UserRole } from "../types/models";

config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

/**
 * Socket authentication middleware
 * Verifies JWT token from handshake auth and attaches user to socket
 */
export const socketAuth = async (
  socket: Socket,
  next: (err?: Error) => void
) => {
  try {
    // Get token from handshake auth
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: UserRole;
    };

    // Check if user exists
    const user = await UserService.findUserById(decoded.id);
    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    // Check if user is active
    if (!user.is_active) {
      return next(new Error("Authentication error: User is inactive"));
    }

    // Attach user to socket
    (socket as any).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      username: user.username,
    };

    // Update user's last active timestamp
    await UserService.updateUser(decoded.id, {
      updated_at: new Date().toISOString(),
    }).catch((err) => {
      logger.warn(
        `Failed to update user's last active timestamp: ${err.message}`
      );
    });

    next();
  } catch (error) {
    logger.error("Socket authentication error:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error("Authentication error: Invalid token"));
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Authentication error: Token expired"));
    }

    return next(new Error("Authentication error: Something went wrong"));
  }
};

/**
 * Socket authorization middleware for specific rooms
 * Ensures users can only join rooms they have access to
 */
export const socketRoomAuth = (
  roomId: string,
  socket: Socket,
  next: (err?: Error) => void
) => {
  // Implementation will be added when handling chat room access controls
  // This will verify if the user has permission to join a specific chat room
  next();
};
