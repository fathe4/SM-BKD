// src/services/messagingService.ts
import { UUID } from "crypto";
import { asyncHandler } from "../../utils/asyncHandler";
import { logger } from "../../utils/logger";
import { SocketMessage } from "../../types/socket";
import { ChatService } from "./chatService";

/**
 * Service for messaging-related operations
 * This service handles messaging operations that might involve users
 * who aren't friends or don't have an existing chat
 */
export class MessagingService {
  /**
   * Send a direct message to a user, creating a chat if needed
   */
  static sendDirectMessage = asyncHandler(
    async (
      senderId: UUID,
      recipientId: UUID,
      content?: string,
      media?: any[],
      autoDeleteAt?: string
    ) => {
      // Check if chat already exists
      let chat = await ChatService.findDirectChat(senderId, recipientId);

      // If no chat exists, create one
      if (!chat) {
        logger.info(`Creating new chat between ${senderId} and ${recipientId}`);
        chat = await ChatService.createChat(senderId, [recipientId], false);
      }

      // Create the message
      const messageData: SocketMessage = {
        chat_id: chat.id,
        sender_id: senderId,
        content,
        media,
        auto_delete_at: autoDeleteAt,
      };

      // Send the message using the chat service
      const message = await ChatService.sendMessage(messageData);

      return {
        chat,
        message,
      };
    },
    "Failed to send direct message"
  );

  /**
   * Get or create a chat with a user
   */
  static getOrCreateDirectChat = asyncHandler(
    async (userId1: UUID, userId2: UUID) => {
      // Check if chat already exists
      let chat = await ChatService.findDirectChat(userId1, userId2);

      // If no chat exists, create one
      if (!chat) {
        logger.info(`Creating new chat between ${userId1} and ${userId2}`);
        chat = await ChatService.createChat(userId1, [userId2], false);
      }

      return chat;
    },
    "Failed to get or create direct chat"
  );
}
