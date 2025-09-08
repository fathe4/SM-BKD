/* eslint-disable indent */
// src/socketio/utils/socketPrivacyUtils.ts
import { UUID } from "crypto";
import { logger } from "../../utils/logger";
import { PrivacySettingsService } from "../../services/privacySettingsService";
import { FriendshipService } from "../../services/friendshipService";
import { shouldSendReadReceipt } from "../../utils/chatPrivacy";

/**
 * Utility class for socket privacy checks
 */
export class SocketPrivacyUtils {
  /**
   * Check if a user can send read receipts to another user
   */
  static async canSendReadReceipt(
    userId: UUID,
    targetId: UUID,
  ): Promise<boolean> {
    try {
      // Get privacy settings for both users
      const [userSettings, targetSettings] = await Promise.all([
        PrivacySettingsService.getUserPrivacySettings(userId),
        PrivacySettingsService.getUserPrivacySettings(targetId),
      ]);

      return shouldSendReadReceipt(userSettings, targetSettings);
    } catch (error) {
      logger.error("Error checking read receipt permissions:", error);
      return false; // Default to not sending on error
    }
  }

  /**
   * Check if sender can add recipients to chat
   */
  static async canMessageUsers(
    senderId: UUID,
    recipientIds: UUID[],
  ): Promise<boolean> {
    try {
      // Check each recipient's privacy settings
      for (const recipientId of recipientIds) {
        const recipientSettings =
          await PrivacySettingsService.getUserPrivacySettings(recipientId);

        // Get the privacy setting that determines who can send messages
        const allowMessagesFrom =
          recipientSettings.settings.messageSettings?.allowMessagesFrom ||
          "everyone";

        switch (allowMessagesFrom) {
          case "everyone":
            // Everyone can send messages, continue to next recipient
            continue;

          case "nobody":
            // Nobody can send messages
            return false;

          case "friends": {
            // Only friends can send messages
            const areFriends = await FriendshipService.checkIfUsersAreFriends(
              senderId,
              recipientId,
            );
            if (!areFriends) return false;
            break;
          }

          case "friends_of_friends": {
            // Friends or friends-of-friends can send messages
            const areFriends = await FriendshipService.checkIfUsersAreFriends(
              senderId,
              recipientId,
            );
            if (areFriends) continue;

            const haveMutualFriends =
              await FriendshipService.checkIfUsersHaveMutualFriends(
                senderId,
                recipientId,
              );
            if (!haveMutualFriends) return false;
            break;
          }

          default:
            // Default to restrictive
            return false;
        }
      }

      // If we get here, all recipients allow messages from this sender
      return true;
    } catch (error) {
      logger.error("Error checking message permissions:", error);
      return false; // Default to not allowing on error
    }
  }
}
