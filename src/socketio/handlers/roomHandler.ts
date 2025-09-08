import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";

// Room management using Map for O(1) lookups
const roomMembers = new Map<string, Set<string>>();

/**
 * Handle socket room events
 */
export function roomHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn(`Socket ${socket.id} attempting to use rooms without user ID`);
    return;
  }

  // Join user to their personal room
  socket.join(userId);

  // Handle joining a chat room
  socket.on("room:join", async (data: { roomId: string }) => {
    const { roomId } = data;

    try {
      // Join the room
      await socket.join(roomId);

      // Add user to room members
      addUserToRoom(roomId, userId);

      // Notify others in the room
      socket.to(roomId).emit("room:userJoined", { roomId, userId });

      // Get current room members and send to the user
      const members = getRoomMembers(roomId);
      socket.emit("room:members", { roomId, members });

      logger.info(`User ${userId} joined room ${roomId}`);
    } catch (error) {
      logger.error(`Error joining room ${roomId}:`, error);
      socket.emit("room:error", {
        roomId,
        error: "Failed to join room",
      });
    }
  });

  // Handle leaving a chat room
  socket.on("room:leave", async (data: { roomId: string }) => {
    const { roomId } = data;

    try {
      await socket.leave(roomId);
      removeUserFromRoom(roomId, userId);
      socket.to(roomId).emit("room:userLeft", { roomId, userId });
    } catch (error) {
      logger.error(`Error leaving room ${roomId}:`, error);
    }
  });

  // Automatically remove user from rooms on disconnect
  socket.on("disconnect", () => {
    // Get all rooms this socket is in
    const joinedRooms = Array.from(socket.rooms).filter(
      (room) => room !== socket.id && room !== userId,
    );

    joinedRooms.forEach((roomId) => {
      removeUserFromRoom(roomId, userId);
      socket.to(roomId).emit("room:userLeft", { roomId, userId });
    });
  });
}

/**
 * Add a user to a room's member list
 */
function addUserToRoom(roomId: string, userId: string): void {
  let members = roomMembers.get(roomId);

  if (!members) {
    members = new Set<string>();
    roomMembers.set(roomId, members);
  }

  members.add(userId);
}

/**
 * Remove a user from a room's member list
 */
function removeUserFromRoom(roomId: string, userId: string): void {
  const members = roomMembers.get(roomId);

  if (!members) {
    return;
  }

  members.delete(userId);

  if (members.size === 0) {
    roomMembers.delete(roomId);
  }
}

/**
 * Get all members of a room
 */
export function getRoomMembers(roomId: string): string[] {
  const members = roomMembers.get(roomId);
  return members ? Array.from(members) : [];
}

/**
 * Check if a user is in a room
 */
export function isUserInRoom(roomId: string, userId: string): boolean {
  const members = roomMembers.get(roomId);
  return members ? members.has(userId) : false;
}
