import { ExtendedError, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { logger } from "../../utils/logger";

// Get JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

/**
 * Socket.IO middleware to verify JWT tokens
 */
export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  try {
    // Get token from handshake auth or query
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.split(" ")[1] ||
      socket.handshake.query.token;

    if (!token) {
      logger.warn(`Socket connection attempt without token: ${socket.id}`);
      return next(new Error("Authentication token required"));
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    // Attach user data to socket
    socket.data.user = decoded;
    socket.data.authenticated = true;

    logger.info(`Socket authenticated: ${socket.id} (User: ${decoded.id})`);
    next();
  } catch (error) {
    logger.error(`Socket authentication error: ${(error as Error).message}`);
    next(new Error("Authentication failed"));
  }
};
