import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";

// Store for active connections (Using Map for O(1) lookups)
const activeConnections = new Map<string, Set<string>>();

/**
 * Handle socket connection events
 */
export function connectionHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn(`Socket ${socket.id} connected without user ID`);
    socket.disconnect(true);
    return;
  }

  // Add to active connections
  addConnection(userId, socket.id);

  // Broadcast user online status
  socket.broadcast.emit("user:online", { userId });

  // Handle disconnect
  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id} (User: ${userId})`);

    // Remove from active connections
    removeConnection(userId, socket.id);

    // Check if user has any remaining connections
    const userConnections = activeConnections.get(userId);
    if (!userConnections || userConnections.size === 0) {
      // Broadcast user offline status if no connections remain
      socket.broadcast.emit("user:offline", { userId });
    }
  });

  // Handle user status updates
  socket.on(
    "user:setStatus",
    (data: { status: "online" | "offline" | "away" }) => {
      socket.broadcast.emit("user:status", { userId, status: data.status });
    }
  );

  // Handle typing status
  socket.on("user:typing", (data: { chatId: string; isTyping: boolean }) => {
    socket.to(data.chatId).emit("user:typing", {
      userId,
      chatId: data.chatId,
      isTyping: data.isTyping,
    });
  });
}

/**
 * Add a connection to the active connections map
 */
function addConnection(userId: string, socketId: string): void {
  let userConnections = activeConnections.get(userId);

  if (!userConnections) {
    userConnections = new Set<string>();
    activeConnections.set(userId, userConnections);
  }

  userConnections.add(socketId);
  logger.debug(`Added connection ${socketId} for user ${userId}`);
}

/**
 * Remove a connection from the active connections map
 */
function removeConnection(userId: string, socketId: string): void {
  const userConnections = activeConnections.get(userId);

  if (!userConnections) {
    return;
  }

  userConnections.delete(socketId);

  if (userConnections.size === 0) {
    activeConnections.delete(userId);
  }
}

/**
 * Get all socket IDs for a user
 */
export function getUserSocketIds(userId: string): string[] {
  const userConnections = activeConnections.get(userId);
  return userConnections ? Array.from(userConnections) : [];
}

/**
 * Check if a user is online (has any active connections)
 */
export function isUserOnline(userId: string): boolean {
  const userConnections = activeConnections.get(userId);
  return !!userConnections && userConnections.size > 0;
}
