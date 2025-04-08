/* eslint-disable indent */
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import { v4 as uuidv4 } from "uuid";
import { MessageRetentionPeriod } from "../../models/privacy-settings.model";
import { PrivacySettingsService } from "../../services/privacySettingsService";
import { getUserStatus } from "../services/presenceService";
import { getUserSocketIds } from "./connectionHandler";
import { messageService } from "../../services/messageService";
import { getIO } from "..";
import { UUID } from "crypto";

// Types for message events
interface SendMessageData {
  chatId: string;
  content?: string;
  media?: Array<{ url: string; type: string }>;
  replyToId?: string;
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
      const { chatId, content, media } = data;

      // Check if empty message
      if (!content && (!media || media.length === 0)) {
        socket.emit("message:error", {
          error: "Message cannot be empty",
        });
        return;
      }

      // Generate a new message ID
      const messageId = uuidv4();

      // Get retention policy for this user/chat
      const userSettings = await PrivacySettingsService.getUserPrivacySettings(
        userId
      );
      const retentionPeriod =
        userSettings.settings.messagePrivacy?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;

      // Calculate auto-delete time based on retention policy
      let autoDeleteAt: Date | undefined;

      if (retentionPeriod !== MessageRetentionPeriod.FOREVER) {
        autoDeleteAt = calculateAutoDeleteTime(retentionPeriod);
      }

      // Convert media objects to strings (JSON stringify) if needed
      const mediaStrings = media
        ? media.map((item) => JSON.stringify(item))
        : [];

      // Create message in database
      const message = await messageService.createMessage({
        id: messageId as UUID,
        chat_id: chatId as UUID,
        sender_id: userId as UUID,
        content,
        media: mediaStrings, // Use string array format
        is_read: false,
        created_at: new Date(),
        auto_delete_at: autoDeleteAt,
        is_deleted: false,
      });

      // Notify the sender (acknowledgement with the created message)
      socket.emit("message:sent", { message });

      // Emit to the chat room (to everyone except sender)
      socket.to(chatId).emit("message:new", { message });

      // Get participants to check who's offline for push notifications
      const participants = await messageService.getChatParticipants(chatId);

      // Send push notification to offline users
      participants.forEach((participant) => {
        if (participant.id !== userId) {
          // Don't notify the sender
          const userStatus = getUserStatus(participant.id);

          if (userStatus.status !== "online") {
            // In a real implementation, queue a push notification here
            logger.debug(
              `Queuing push notification for offline user ${participant.id}`
            );
          }
        }
      });
    } catch (error) {
      logger.error("Error sending message:", error);
      socket.emit("message:error", {
        error: "Failed to send message",
      });
    }
  });

  // Handle message read receipts
  socket.on("message:read", async (data: ReadReceiptData) => {
    try {
      const { chatId, messageId } = data;

      // Update message read status in database
      await messageService.markMessageAsRead(messageId, userId);

      // Get the original message to send with the read receipt
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return; // Message might have been deleted
      }

      // Check recipient's privacy settings for read receipts
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
          senderSocketIds.forEach((socketId) => {
            socketServer.to(socketId).emit("message:read", {
              chatId,
              messageId,
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
        lastRead: messageId,
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

/**
 * Calculate auto-delete time based on retention policy
 * @returns Date or undefined if no auto-delete is needed
 */
function calculateAutoDeleteTime(
  retentionPeriod: MessageRetentionPeriod
): Date | undefined {
  const now = new Date();

  switch (retentionPeriod) {
    case MessageRetentionPeriod.ONE_DAY:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case MessageRetentionPeriod.ONE_WEEK:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case MessageRetentionPeriod.ONE_MONTH:
      return new Date(now.setMonth(now.getMonth() + 1));
    case MessageRetentionPeriod.THREE_MONTHS:
      return new Date(now.setMonth(now.getMonth() + 3));
    case MessageRetentionPeriod.SIX_MONTHS:
      return new Date(now.setMonth(now.getMonth() + 6));
    case MessageRetentionPeriod.ONE_YEAR:
      return new Date(now.setFullYear(now.getFullYear() + 1));
    case MessageRetentionPeriod.AFTER_READ:
      // Messages with AFTER_READ will be deleted by a separate process after being read
      return undefined;
    default:
      return undefined;
  }
}
