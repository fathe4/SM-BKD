// src/socketio/handlers/chatHandler.ts
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import { ChatService } from "../../services/chatService";

/**
 * Handle chat-related socket events
 */
export function chatHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn(
      `Socket ${socket.id} attempting to use chat functions without user ID`,
    );
    socket.disconnect(true);
    return;
  }

  // Handle get latest chats event
  socket.on(
    "chats:getLatest",
    async (data: { page?: number; limit?: number } = {}) => {
      try {
        const page = data?.page || 1;
        const limit = data?.limit || 20;

        logger.info(`Fetching latest chats for user ${userId}`);

        // Import ChatService here to avoid circular dependencies

        // Reuse existing ChatService method to get user's chats
        const { chats, total } = await ChatService.getUserChats(
          userId,
          page,
          limit,
        );

        logger.debug(`Emitting ${chats.length} latest chats to user ${userId}`);

        // Emit the chats back to the client
        socket.emit("chats:latest", {
          chats,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        });
      } catch (error) {
        logger.error("Error fetching latest chats:", error);
        socket.emit("chats:error", {
          error: "Failed to fetch latest chats",
        });
      }
    },
  );

  // Handle typing status in chat
  socket.on(
    "chat:typing",
    (data: { chatId: string; isTyping: boolean; name: string }) => {
      try {
        const { chatId, isTyping, name } = data;

        // Broadcast typing status to all users in the chat room except sender
        socket.to(chatId).emit("chat:typing", {
          chatId,
          userId,
          name,
          isTyping,
          timestamp: new Date(),
        });

        logger.debug(
          `User ${userId} ${
            isTyping ? "is typing" : "stopped typing"
          } in chat ${chatId}`,
        );
      } catch (error) {
        logger.error("Error processing typing status:", error);
      }
    },
  );
}
