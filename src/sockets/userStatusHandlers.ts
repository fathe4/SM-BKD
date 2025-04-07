// src/sockets/userStatusHandlers.ts
import { Server, Socket } from "socket.io";
import { UserStatusEvents } from "../types/socket";
import { logger } from "../utils/logger";
import { connectedUsers, getOnlineUsers } from "../config/socketio";

// Map to track user status (online, away, busy, etc.)
const userStatus = new Map<string, string>();

/**
 * Set up user status event handlers for a socket
 */
export function setupUserStatusHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn("Cannot set up user status handlers: Missing user ID");
    return;
  }

  // Set default status to online when connecting
  userStatus.set(userId, "online");

  // Broadcast user online status to friends
  // (in a real app, you'd filter this to only friends/relevant users)
  socket.broadcast.emit(UserStatusEvents.USER_ONLINE, {
    user_id: userId,
    status: "online",
  });

  // Handle custom status updates
  socket.on(UserStatusEvents.SET_STATUS, (status: string) => {
    // Validate status value
    const validStatuses = ["online", "away", "busy", "offline", "invisible"];
    if (!validStatuses.includes(status)) {
      return;
    }

    // Update status
    userStatus.set(userId, status);

    // If status is not "invisible", broadcast to others
    if (status !== "invisible") {
      socket.broadcast.emit(UserStatusEvents.SET_STATUS, {
        user_id: userId,
        status,
      });
    }

    logger.debug(`User ${userId} set status to ${status}`);
  });

  // Handle requests for online users
  socket.on(UserStatusEvents.GET_ONLINE_USERS, (callback) => {
    try {
      // Get online users
      const onlineUsers = getOnlineUsers();

      // Filter out "invisible" users
      const visibleUsers = onlineUsers.filter(
        (id) => userStatus.get(id) !== "invisible"
      );

      // Map to include status
      const usersWithStatus = visibleUsers.map((id) => ({
        user_id: id,
        status: userStatus.get(id) || "online",
      }));

      // Send response via callback
      if (typeof callback === "function") {
        callback({
          users: usersWithStatus,
        });
      }
    } catch (error) {
      logger.error("Error getting online users:", error);
      if (typeof callback === "function") {
        callback({
          error: "Failed to get online users",
          users: [],
        });
      }
    }
  });

  // On disconnect, update status and notify others
  socket.on("disconnect", () => {
    // Only broadcast offline status if this was the last connection for this user
    const userConnections = connectedUsers.get(userId);
    if (!userConnections || userConnections.size === 0) {
      // Only broadcast if user wasn't invisible
      if (userStatus.get(userId) !== "invisible") {
        socket.broadcast.emit(UserStatusEvents.USER_OFFLINE, {
          user_id: userId,
        });
      }

      // Clean up status
      userStatus.delete(userId);
    }
  });
}
