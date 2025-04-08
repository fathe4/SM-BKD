/* eslint-disable indent */
// src/middlewares/messagePrivacyMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { UUID } from "crypto";
import { AppError } from "./errorHandler";
import { FriendshipService } from "../services/friendshipService";
import { PrivacySettingsService } from "../services/privacySettingsService";
import { MessageRetentionPeriod } from "../models/privacy-settings.model";
import { messageService } from "../services/messageService";
import { logger } from "../utils/logger";

/**
 * Middleware to enforce privacy policies for messaging operations
 */
export class MessagePrivacyMiddleware {
  /**
   * Check if a user can send messages to another user based on privacy settings
   */
  static canSendMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // The sender is the authenticated user
      const senderId = req.user?.id as UUID;

      // The recipient is specified in the request params or body
      const recipientId = req.params.recipientId || req.body.recipientId;

      if (!senderId || !recipientId) {
        return next(new AppError("Sender or recipient ID missing", 400));
      }

      // Skip check if sender is the same as recipient (shouldn't happen in practice)
      if (senderId === recipientId) {
        return next();
      }

      // Get recipient's privacy settings
      const recipientSettings =
        await PrivacySettingsService.getUserPrivacySettings(recipientId);

      // Get the privacy setting that determines who can send messages
      const allowMessagesFrom =
        recipientSettings.settings.messageSettings?.allowMessagesFrom ||
        recipientSettings.settings.allowMessagesFrom ||
        "everyone";

      // Apply rules based on privacy setting
      switch (allowMessagesFrom) {
        case "everyone":
          return next(); // Allow everyone to send messages

        case "nobody":
          throw new AppError("This user doesn't allow messages", 403);

        case "friends": {
          // Check if users are friends
          const areFriends = await FriendshipService.checkIfUsersAreFriends(
            senderId,
            recipientId
          );
          if (!areFriends) {
            throw new AppError(
              "You must be friends with this user to send messages",
              403
            );
          }
          return next();
        }

        case "friends_of_friends": {
          // First check if they're direct friends
          const directFriends = await FriendshipService.checkIfUsersAreFriends(
            senderId,
            recipientId
          );
          if (directFriends) {
            return next();
          }

          // If not direct friends, check for mutual friends
          const haveMutualFriends =
            await FriendshipService.checkIfUsersHaveMutualFriends(
              senderId,
              recipientId
            );
          if (!haveMutualFriends) {
            throw new AppError(
              "You need to have mutual friends with this user to send messages",
              403
            );
          }
          return next();
        }

        default:
          // Default to restrictive if setting is unknown
          throw new AppError(
            "You don't have permission to message this user",
            403
          );
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Calculate and apply message retention policy based on user preferences
   * This attaches the appropriate auto-delete time to the request
   */
  static applyRetentionPolicy = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const senderId = req.user?.id as UUID;
      const recipientId = req.params.recipientId || req.body.recipientId;

      if (!senderId || !recipientId) {
        return next(new AppError("Sender or recipient ID missing", 400));
      }

      // Get both users' privacy settings
      const [senderSettings, recipientSettings] = await Promise.all([
        PrivacySettingsService.getUserPrivacySettings(senderId),
        PrivacySettingsService.getUserPrivacySettings(recipientId),
      ]);

      // Get retention policies from both users
      const senderRetention =
        senderSettings.settings.messageSettings?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;
      const recipientRetention =
        recipientSettings.settings.messageSettings?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;

      // Apply the strictest policy (shortest retention period)
      // Define order from shortest to longest retention
      const retentionHierarchy = [
        MessageRetentionPeriod.AFTER_READ,
        MessageRetentionPeriod.ONE_DAY,
        MessageRetentionPeriod.ONE_WEEK,
        MessageRetentionPeriod.ONE_MONTH,
        MessageRetentionPeriod.THREE_MONTHS,
        MessageRetentionPeriod.SIX_MONTHS,
        MessageRetentionPeriod.ONE_YEAR,
        MessageRetentionPeriod.FOREVER,
      ];

      // Find the strictest policy
      const senderIndex = retentionHierarchy.indexOf(senderRetention);
      const recipientIndex = retentionHierarchy.indexOf(recipientRetention);

      if (senderIndex === -1 || recipientIndex === -1) {
        logger.warn(
          `Invalid retention period found: ${senderRetention} or ${recipientRetention}`
        );
      }

      const strictestPolicyIndex = Math.min(
        senderIndex !== -1 ? senderIndex : retentionHierarchy.length - 1,
        recipientIndex !== -1 ? recipientIndex : retentionHierarchy.length - 1
      );

      const retentionPolicy = retentionHierarchy[strictestPolicyIndex];

      // Calculate auto-delete time based on retention policy
      let autoDeleteAt: Date | null = null;

      const now = new Date();
      switch (retentionPolicy) {
        case MessageRetentionPeriod.ONE_DAY:
          autoDeleteAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
        case MessageRetentionPeriod.ONE_WEEK:
          autoDeleteAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case MessageRetentionPeriod.ONE_MONTH:
          autoDeleteAt = new Date(now.setMonth(now.getMonth() + 1));
          break;
        case MessageRetentionPeriod.THREE_MONTHS:
          autoDeleteAt = new Date(now.setMonth(now.getMonth() + 3));
          break;
        case MessageRetentionPeriod.SIX_MONTHS:
          autoDeleteAt = new Date(now.setMonth(now.getMonth() + 6));
          break;
        case MessageRetentionPeriod.ONE_YEAR:
          autoDeleteAt = new Date(now.setFullYear(now.getFullYear() + 1));
          break;
        case MessageRetentionPeriod.AFTER_READ:
          // Special handling - will be deleted after being read
          autoDeleteAt = null; // Marked for special handling
          break;
        case MessageRetentionPeriod.FOREVER:
        default:
          autoDeleteAt = null; // No auto-deletion
          break;
      }

      // Attach the retention policy and auto-delete time to res.locals for the controller
      res.locals.messageRetentionPolicy = retentionPolicy;
      res.locals.messageAutoDeleteAt = autoDeleteAt;

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a user can forward a message
   */
  static canForwardMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = req.user?.id as UUID;
      const messageId = req.params.messageId || req.body.messageId;

      if (!userId || !messageId) {
        return next(new AppError("User ID or message ID missing", 400));
      }

      // Get message details to find the original sender
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return next(new AppError("Message not found", 404));
      }

      // Check if user is part of the conversation
      const chatParticipants = await messageService.getChatParticipants(
        message.chat_id
      );
      const isParticipant = chatParticipants.some((p) => p.id === userId);

      if (message.sender_id !== userId && !isParticipant) {
        return next(new AppError("You don't have access to this message", 403));
      }

      // Check original sender's privacy settings for forwarding permission
      const senderSettings =
        await PrivacySettingsService.getUserPrivacySettings(message.sender_id);
      const allowForwarding =
        senderSettings.settings.messageSettings?.allowForwarding ?? true;

      if (!allowForwarding) {
        return next(
          new AppError(
            "The sender doesn't allow forwarding of their messages",
            403
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a read receipt should be sent based on privacy settings
   */
  static checkReadReceiptPermission = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = req.user?.id as UUID;
      const messageId = req.params.messageId || req.body.messageId;

      if (!userId || !messageId) {
        return next(new AppError("User ID or message ID missing", 400));
      }

      // Get the message to find the sender
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return next(new AppError("Message not found", 404));
      }

      // Get both users' privacy settings
      const [userSettings, senderSettings] = await Promise.all([
        PrivacySettingsService.getUserPrivacySettings(userId),
        PrivacySettingsService.getUserPrivacySettings(message.sender_id),
      ]);

      // Check if both users allow read receipts
      const userAllowsReadReceipts =
        userSettings.settings.messageSettings?.allowMessageReadReceipts ?? true;
      const senderAllowsReadReceipts =
        senderSettings.settings.messageSettings?.allowMessageReadReceipts ??
        true;

      // Set a flag in res.locals to indicate if read receipts are allowed
      res.locals.sendReadReceipt =
        userAllowsReadReceipts && senderAllowsReadReceipts;

      next();
    } catch (error) {
      next(error);
    }
  };
}
