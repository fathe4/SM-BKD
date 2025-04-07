// src/config/socketio.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { setupUserStatusHandlers } from "../sockets/userStatusHandlers";
import { setupChatHandlers } from "../sockets/chatHandlers";
import { authenticateSocket } from "../middlewares/socketAuth";

// Track connected users
export const connectedUsers = new Map<string, Set<string>>();

/**
 * Initialize Socket.IO server
 */
export function initializeSocketIO(httpServer: HttpServer): Server {
  // Create Socket.IO server
  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.FRONTEND_URL
          : ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      credentials: true,
    },
    pingTimeout: 60000, // 1 minute without a pong packet to consider the connection closed
  });

  // Apply authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user?.id;

    if (!userId) {
      logger.warn("Socket connection without user ID");
      socket.disconnect();
      return;
    }

    logger.info(`User connected: ${userId}, Socket ID: ${socket.id}`);

    // Track connected user
    trackConnectedUser(userId, socket.id);

    // Join user's personal room for direct messages
    socket.join(`user:${userId}`);

    // Setup event handlers
    setupChatHandlers(io, socket);
    setupUserStatusHandlers(io, socket);

    // Handle disconnect
    socket.on("disconnect", () => {
      logger.info(`User disconnected: ${userId}, Socket ID: ${socket.id}`);
      removeConnectedUser(userId, socket.id);
    });
  });

  logger.info("Socket.IO server initialized");
  return io;
}

/**
 * Track connected user
 */
function trackConnectedUser(userId: string, socketId: string): void {
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set<string>());
  }
  connectedUsers.get(userId)?.add(socketId);

  // Log online status for debugging
  logger.debug(
    `User ${userId} online with ${connectedUsers.get(userId)?.size} connections`
  );
}

/**
 * Remove connected user
 */
function removeConnectedUser(userId: string, socketId: string): void {
  const userSockets = connectedUsers.get(userId);
  if (userSockets) {
    userSockets.delete(socketId);
    if (userSockets.size === 0) {
      connectedUsers.delete(userId);
      logger.debug(`User ${userId} went offline`);
    } else {
      logger.debug(
        `User ${userId} still online with ${userSockets.size} connections`
      );
    }
  }
}

/**
 * Check if user is online
 */
export function isUserOnline(userId: string): boolean {
  return (
    connectedUsers.has(userId) && (connectedUsers.get(userId)?.size ?? 0) > 0
  );
}

/**
 * Get all online users
 */
export function getOnlineUsers(): string[] {
  return Array.from(connectedUsers.keys());
}
