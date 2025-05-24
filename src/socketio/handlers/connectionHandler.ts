import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";

// Store for active connections and user statuses
const activeConnections = new Map<string, Set<string>>();
const userStatuses = new Map<
  string,
  {
    status: "online" | "offline" | "away";
    lastActive: Date;
  }
>();

export function connectionHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn(`Socket ${socket.id} connected without user ID`);
    socket.disconnect(true);
    return;
  }

  // Add to active connections
  addConnection(userId, socket.id);

  // Set initial status
  userStatuses.set(userId, {
    status: "online",
    lastActive: new Date(),
  });

  // Broadcast user online status
  socket.broadcast.emit("user:online", {
    userId,
    lastActive: new Date().toISOString(),
  });

  // Handle status requests
  socket.on("user:getStatus", (data: { targetUserId: string }) => {
    const status = userStatuses.get(data.targetUserId) || {
      status: "offline",
      lastActive: new Date(),
    };

    socket.emit("user:statusInfo", {
      userId: data.targetUserId,
      status: status.status,
      lastActive: status.lastActive.toISOString(),
    });
  });

  // Handle user status updates
  socket.on(
    "user:setStatus",
    (data: { status: "online" | "offline" | "away" }) => {
      userStatuses.set(userId, {
        status: data.status,
        lastActive: new Date(),
      });

      socket.broadcast.emit("user:status", {
        userId,
        status: data.status,
        lastActive: new Date().toISOString(),
      });
    }
  );

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: ${socket.id} (User: ${userId})`);

    // Remove from active connections
    removeConnection(userId, socket.id);

    // Check if user has any remaining connections
    const userConnections = activeConnections.get(userId);
    if (!userConnections || userConnections.size === 0) {
      // Update status to offline
      userStatuses.set(userId, {
        status: "offline",
        lastActive: new Date(),
      });

      // Broadcast user offline status if no connections remain
      socket.broadcast.emit("user:offline", {
        userId,
        lastActive: new Date().toISOString(),
      });
    }
  });
}

// Helper to check if user has other active connections
// function hasOtherConnections(userId: string): boolean {
//   const connections = activeConnections.get(userId);
//   return !!connections && connections.size > 0;
// }

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
