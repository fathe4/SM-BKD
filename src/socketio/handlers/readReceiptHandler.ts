import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import { PrivacySettingsService } from "../../services/privacySettingsService";
import { getUserSocketIds } from "./connectionHandler";
import { enhancedMessageService } from "../../services/enhancedMessageService";
import { messageService } from "../../services/messageService";

/**
 * Handle read receipt-specific functionality
 */
export function readReceiptHandler(io: SocketIOServer, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    return;
  }

  // Handle batch read receipts (mark multiple messages as read at once)
  socket.on(
    "messages:readBatch",
    async (data: { chatId: string; messageIds: string[] }) => {
      try {
        const { chatId, messageIds } = data;

        if (!chatId || !Array.isArray(messageIds) || messageIds.length === 0) {
          return;
        }

        // Single batched UPDATE + last_read write (was: one
        // UPDATE+SELECT+UPDATE chain per message)
        await messageService.markMessagesAsReadBatch(
          messageIds,
          userId,
          chatId,
        );

        // Reset the reader's unread badge on all their devices
        // (this was missing — the sidebar badge never reset in real-time)
        getUserSocketIds(userId).forEach((socketId) => {
          io.to(socketId).emit("chats:update", { chatId, unreadCount: 0 });
        });

        // Fetch the affected messages once for sender notifications
        const messages = await Promise.all(
          messageIds.map(async (messageId) => {
            try {
              return await messageService.getMessageById(messageId);
            } catch {
              return null;
            }
          }),
        );

        // Get all unique senders from the fetched messages
        const senders = new Map();
        messages.forEach((message) => {
          if (message && message.sender_id !== userId) {
            // Don't notify self
            senders.set(message.sender_id, true);
          }
        });

        // Notify each sender about their messages being read
        for (const senderId of senders.keys()) {
          // Check if this sender allows read receipts (Redis-cached)
          const senderSettings =
            await PrivacySettingsService.getUserPrivacySettings(senderId);
          const allowReadReceipts =
            senderSettings.settings.messagePrivacy?.allowMessageReadReceipts ??
            true;

          if (allowReadReceipts) {
            // Get sender's active socket connections
            const senderSocketIds = getUserSocketIds(senderId);

            if (senderSocketIds.length > 0) {
              // Send batch read receipt notification to sender
              senderSocketIds.forEach((socketId) => {
                io.to(socketId).emit("messages:readBatch", {
                  chatId,
                  readBy: userId,
                  timestamp: new Date(),
                  messageIds: messages
                    .filter((m) => m && m.sender_id === senderId)
                    .map((m) => m!.id),
                });
              });
            }
          }
        }

        // Update user's last read position in the chat
        io.to(chatId).emit("chat:activity", {
          chatId,
          userId,
          lastRead: messageIds[messageIds.length - 1],
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error("Error processing batch read receipts:", error);
      }
    },
  );
}
