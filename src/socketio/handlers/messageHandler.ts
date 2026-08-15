/* eslint-disable indent */
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import { MessageRetentionPeriod } from "../../models/privacy-settings.model";
import { PrivacySettingsService } from "../../services/privacySettingsService";
import { getUserStatus } from "../services/presenceService";
import { getUserSocketIds } from "./connectionHandler";
import { messageService } from "../../services/messageService";
import { getIO } from "..";
import { UUID } from "crypto";
import { ChatService } from "../../services/chatService";
import { enhancedMessageService } from "../../services/enhancedMessageService";
import { redisService } from "../../services/redis.service";

// Types for message events
interface SendMessageData {
  chatId: string;
  content?: string;
  media?: Array<{ url: string; type: string }>;
  replyToId?: string;
  sender: any;
}

interface ReadReceiptData {
  chatId: string;
  messageId: string;
}

/**
 * Handle message-related socket events
 */
export function messageHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn(
      `Socket ${socket.id} attempting to use messaging without user ID`
    );
    socket.disconnect(true);
    return;
  }

  // Handle new message
  socket.on("message:send", async (data: SendMessageData) => {
    try {
      const { chatId, content, media, sender } = data;

      // Check if empty message
      if (!content && (!media || media.length === 0)) {
        socket.emit("message:error", {
          error: "Message cannot be empty",
        });
        return;
      }

      // Convert media objects to strings (JSON stringify) if needed
      const mediaStrings = media ? media.map(item => JSON.stringify(item)) : [];

      // Create message in database (privacy lookup is Redis-cached; cache
      // invalidation runs fire-and-forget inside the service)
      const message = await enhancedMessageService.createMessage({
        chat_id: chatId as UUID,
        sender_id: userId as UUID,
        content,
        media: mediaStrings, // Use string array format
      });

      const newMsg = { ...message, sender };

      // ---- Deliver FIRST: everything after this point must never delay
      // ---- the recipient seeing the message.

      // Notify the sender (acknowledgement with the created message)
      socket.emit("message:sent", { message: newMsg });

      // Emit to the chat room (to everyone except sender)
      socket.to(chatId).emit("message:new", { message: newMsg });

      // ---- Non-critical follow-up: sidebar patches for every participant.

      const participants = await messageService.getChatParticipants(chatId);

      const lastMessagePatch = {
        chatId,
        lastMessage: {
          content: content || "[Media]",
          sender_id: userId,
          created_at: new Date().toISOString(),
        },
      };

      participants.forEach(participant => {
        const participantSocketIds = getUserSocketIds(participant.id);
        participantSocketIds.forEach(socketId => {
          // If the participant is not the sender, increment their unread count by 1 in the sidebar
          const patch = {
            ...lastMessagePatch,
            ...(participant.id !== userId ? { incrementUnread: true } : {}),
          };
          io.to(socketId).emit("chats:update", patch);
        });
      });
    } catch (error) {
      logger.error("Error sending message:", error);
      socket.emit("message:error", {
        error: "Failed to send message",
      });
    }
  });

  // Handle message read receipts
  socket.on("message:read", async (data: any) => {
    try {
      const { chatId, messageId, messageIds } = data;
      const idsToMark = messageIds && Array.isArray(messageIds)
        ? messageIds
        : (messageId ? [messageId] : []);

      if (idsToMark.length === 0 || !chatId) return;

      // Single batched UPDATE instead of one UPDATE+SELECT+UPDATE per message
      await messageService.markMessagesAsReadBatch(idsToMark, userId, chatId);

      // Invalidate the reader's chat-list cache (fire-and-forget)
      redisService.invalidateUserCaches(userId).catch(cacheErr => {
        logger.error(
          `Error invalidating Redis cache on message read: ${cacheErr}`
        );
      });

      // Notify all the reader's connected devices to set unread count to 0 for this chat
      const readerSocketIds = getUserSocketIds(userId);
      readerSocketIds.forEach(socketId => {
        io.to(socketId).emit("chats:update", {
          chatId,
          unreadCount: 0,
        });
      });

      // Get the last read message to send with the read receipt
      const activeMessageId = idsToMark[idsToMark.length - 1];
      const message = await messageService.getMessageById(activeMessageId);

      if (!message) {
        return; // Message might have been deleted
      }

      // Check recipient's privacy settings for read receipts (Redis-cached)
      const senderSettings =
        await PrivacySettingsService.getUserPrivacySettings(message.sender_id);
      const allowReadReceipts =
        senderSettings.settings.messagePrivacy?.allowMessageReadReceipts ??
        true;

      if (allowReadReceipts) {
        // Notify the sender of the original message
        const senderSocketIds = getUserSocketIds(message.sender_id);

        if (senderSocketIds.length > 0) {
          // Emit to all the sender's connected devices
          const socketServer = getIO();
          senderSocketIds.forEach(socketId => {
            socketServer.to(socketId).emit("message:read", {
              chatId,
              messageId: activeMessageId,
              readBy: userId,
              readAt: new Date(),
            });
          });
        }
      }

      // Also notify other participants in the chat that this user has read the message
      socket.to(chatId).emit("chat:activity", {
        chatId,
        userId,
        lastRead: activeMessageId,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error("Error processing read receipt:", error);
    }
  });

  // Handle message edits
  socket.on(
    "message:edit",
    async (data: { messageId: string; content: string }) => {
      try {
        const { messageId, content } = data;

        // Check if content is empty
        if (!content.trim()) {
          socket.emit("message:error", {
            error: "Message content cannot be empty",
          });
          return;
        }

        // Get the original message
        const originalMessage = await messageService.getMessageById(messageId);

        if (!originalMessage) {
          socket.emit("message:error", {
            error: "Message not found",
          });
          return;
        }

        // Check if user is the sender
        if (originalMessage.sender_id !== userId) {
          socket.emit("message:error", {
            error: "You can only edit your own messages",
          });
          return;
        }

        // Update message in database - don't include updated_at since it's handled in service
        await messageService.updateMessage(messageId, {
          content,
        });

        // Notify the chat room about the edit
        io.to(originalMessage.chat_id).emit("message:edited", {
          messageId,
          content,
          editedAt: new Date(),
        });
      } catch (error) {
        logger.error("Error editing message:", error);
        socket.emit("message:error", {
          error: "Failed to edit message",
        });
      }
    }
  );

  // Handle message deletion
  socket.on("message:delete", async (data: { messageId: string }) => {
    try {
      const { messageId } = data;

      // Get the original message
      const originalMessage = await messageService.getMessageById(messageId);

      if (!originalMessage) {
        socket.emit("message:error", {
          error: "Message not found",
        });
        return;
      }

      // Check if user is the sender
      if (originalMessage.sender_id !== userId) {
        socket.emit("message:error", {
          error: "You can only delete your own messages",
        });
        return;
      }

      // Soft delete the message
      await messageService.deleteMessage(messageId);

      // Notify the chat room about the deletion
      io.to(originalMessage.chat_id).emit("message:deleted", {
        messageId,
        deletedAt: new Date(),
      });
    } catch (error) {
      logger.error("Error deleting message:", error);
      socket.emit("message:error", {
        error: "Failed to delete message",
      });
    }
  });
}
