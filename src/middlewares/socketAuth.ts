// src/middlewares/socketAuth.ts
import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";
import { UserService } from "../services/userService";
import { config } from "dotenv";

config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

/**
 * Authenticate Socket.IO connections using JWT token
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    // Get auth token from handshake
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    // Check if user exists
    const user = await UserService.findUserById(decoded.id);
    if (!user) {
      return next(new Error("User not found"));
    }

    // Check if user is active
    if (!user.is_active) {
      return next(new Error("Account is deactivated"));
    }

    // Attach user data to socket
    socket.data.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    logger.error("Socket authentication error:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error("Invalid authentication token"));
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Authentication token expired"));
    }

    next(new Error("Authentication failed"));
  }
}
