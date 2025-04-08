import { messageService } from "../services/messageService";
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "./logger";
import { PrivacySettingsService } from "../services/privacySettingsService";
import { getUserSocketIds } from "../socketio/handlers/connectionHandler";

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

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
          return;
        }

        // Process each message
        const results = await Promise.all(
          messageIds.map(async (messageId) => {
            try {
              // Mark as read in database
              await messageService.markMessageAsRead(messageId, userId);

              // Get the message to find sender
              const message = await messageService.getMessageById(messageId);

              if (!message) {
                return { messageId, success: false, reason: "not_found" };
              }

              return { messageId, success: true, message };
            } catch (error) {
              logger.error(
                `Error marking message ${messageId} as read:`,
                error
              );
              return { messageId, success: false, reason: "error" };
            }
          })
        );

        // Get all unique senders from the successful results
        const senders = new Map();
        results
          .filter((r) => r.success && r.message)
          .forEach((result) => {
            const message = result.message;
            if (message && message.sender_id !== userId) {
              // Don't notify self
              senders.set(message.sender_id, true);
            }
          });

        // Notify each sender about their messages being read
        for (const senderId of senders.keys()) {
          // Check if this sender allows read receipts
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
                  messageIds: results
                    .filter(
                      (r) =>
                        r.success &&
                        r.message &&
                        r.message.sender_id === senderId
                    )
                    .map((r) => r.messageId),
                });
              });
            }
          }
        }

        // Update user's last read position in the chat
        socket.to(chatId).emit("chat:activity", {
          chatId,
          userId,
          lastRead: messageIds[messageIds.length - 1], // Assuming messages are in chronological order
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error("Error processing batch read receipts:", error);
      }
    }
  );

  // Handle displaying typing indicator
  socket.on("chat:typing", (data: { chatId: string; isTyping: boolean }) => {
    const { chatId, isTyping } = data;

    // Broadcast typing status to other users in the chat
    socket.to(chatId).emit("chat:typing", {
      chatId,
      userId,
      isTyping,
      timestamp: new Date(),
    });
  });
}
