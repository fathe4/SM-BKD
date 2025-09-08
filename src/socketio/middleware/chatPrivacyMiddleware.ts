// src/socketio/middleware/chatPrivacyMiddleware.ts
import { ExtendedError, Socket } from "socket.io";
import { logger } from "../../utils/logger";
import {
  canSeeOnlineStatus,
  canSeeLastActive,
  shouldSendReadReceipt,
} from "../../utils/chatPrivacy";
import { PrivacySettingsService } from "../../services/privacySettingsService";
import { FriendshipService } from "../../services/friendshipService";
import { UUID } from "crypto";

/**
 * Socket.IO middleware for chat privacy
 */
export class SocketChatPrivacyMiddleware {
  /**
   * Check if user can see online status of another user
   */
  static async canSeeOnlineStatus(
    socket: Socket,
    targetId: string,
  ): Promise<boolean> {
    try {
      const userId = socket.data.user?.id;
      if (!userId || !targetId) return false;

      const targetSettings =
        await PrivacySettingsService.getUserPrivacySettings(targetId as UUID);
      return await canSeeOnlineStatus(userId, targetId as UUID, targetSettings);
    } catch (error) {
      logger.error("Error checking online status visibility:", error);
      return false;
    }
  }

  /**
   * Check if user can see last active status of another user
   */
  static async canSeeLastActive(
    socket: Socket,
    targetId: string,
  ): Promise<boolean> {
    try {
      const userId = socket.data.user?.id;
      if (!userId || !targetId) return false;

      const targetSettings =
        await PrivacySettingsService.getUserPrivacySettings(targetId as UUID);
      return await canSeeLastActive(userId, targetId as UUID, targetSettings);
    } catch (error) {
      logger.error("Error checking last active visibility:", error);
      return false;
    }
  }

  /**
   * Check if read receipts should be sent between users
   */
  static async shouldSendReadReceipt(
    socket: Socket,
    targetId: string,
  ): Promise<boolean> {
    try {
      const userId = socket.data.user?.id;
      if (!userId || !targetId) return false;

      const [userSettings, targetSettings] = await Promise.all([
        PrivacySettingsService.getUserPrivacySettings(userId as UUID),
        PrivacySettingsService.getUserPrivacySettings(targetId as UUID),
      ]);

      return shouldSendReadReceipt(userSettings, targetSettings);
    } catch (error) {
      logger.error("Error checking read receipt permission:", error);
      return false;
    }
  }

  /**
   * Middleware for validating participants before adding to a chat
   */
  static canAddParticipantsMiddleware = (
    socket: Socket,
    next: (err?: ExtendedError) => void,
  ) => {
    // Store the original emit function
    const originalEmit = socket.emit;

    // Override the emit function to add validation for 'chat:addParticipants' event
    socket.emit = function <Ev extends string>(
      ev: Ev,
      ...args: any[]
    ): boolean {
      // If this is a chat:addParticipants event, apply validation
      if (ev === "chat:addParticipants") {
        const data = args[0];
        const userId = socket.data.user?.id;
        const participants = data?.participants;

        if (!userId || !participants || !Array.isArray(participants)) {
          // Call the original emit with an error
          return originalEmit.call(this, "error", {
            message: "Invalid participants data",
          });
        }

        // Perform the validation asynchronously
        (async () => {
          try {
            for (const participantId of participants) {
              const targetSettings =
                await PrivacySettingsService.getUserPrivacySettings(
                  participantId,
                );
              const allowMessagesFrom =
                targetSettings.settings.messageSettings?.allowMessagesFrom ||
                "everyone";

              if (allowMessagesFrom === "nobody") {
                return originalEmit.call(this, "error", {
                  message: `User ${participantId} doesn't allow messages`,
                });
              }

              if (allowMessagesFrom === "friends") {
                const areFriends =
                  await FriendshipService.checkIfUsersAreFriends(
                    userId,
                    participantId,
                  );
                if (!areFriends) {
                  return originalEmit.call(this, "error", {
                    message: `You must be friends with user ${participantId} to add them to a chat`,
                  });
                }
              }

              if (allowMessagesFrom === "friends_of_friends") {
                const areFriends =
                  await FriendshipService.checkIfUsersAreFriends(
                    userId,
                    participantId,
                  );
                if (!areFriends) {
                  const haveMutualFriends =
                    await FriendshipService.checkIfUsersHaveMutualFriends(
                      userId,
                      participantId,
                    );
                  if (!haveMutualFriends) {
                    return originalEmit.call(this, "error", {
                      message: `You need to have mutual friends with user ${participantId}`,
                    });
                  }
                }
              }
            }

            // If validation passes, call the original emit
            return originalEmit.apply(this, [ev, ...args]);
          } catch (error) {
            logger.error("Error in canAddParticipants validation:", error);
            return originalEmit.call(this, "error", {
              message: "Failed to validate participants",
            });
          }
        })();

        return true;
      }

      // For other events, just pass through
      return originalEmit.apply(this, [ev, ...args]);
    };

    next();
  };
}
