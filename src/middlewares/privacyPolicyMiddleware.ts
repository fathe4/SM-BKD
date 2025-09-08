/* eslint-disable indent */
// src/middlewares/privacyPolicyMiddleware.ts

import { Request, Response, NextFunction } from "express";
import { UUID } from "crypto";
import { AppError } from "./errorHandler";
import { FriendshipService } from "../services/friendshipService";
import { PrivacySettingsService } from "../services/privacySettingsService";
import { MessageRetentionPeriod } from "../models/privacy-settings.model";
import { supabase } from "@/config/supabase";
import { logger } from "@/utils/logger";
import { getRequiredIds } from "@/utils/privacyHelpers";

/**
 * Middleware to enforce privacy policies for various operations
 */
export class PrivacyPolicyMiddleware {
  /**
   * Check if a user can send messages to another user with enhanced privacy checks
   */
  static canSendMessage = async (
    req: Request,
    res: Response,
    next: NextFunction,
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

      // Use enhanced message privacy settings if available, fall back to legacy setting
      const allowMessagesFrom =
        recipientSettings.settings.messagePrivacy?.allowMessagesFrom ||
        recipientSettings.settings.allowMessagesFrom;

      // Everyone is allowed
      if (allowMessagesFrom === "everyone") {
        return next();
      }

      // Nobody is allowed
      if (allowMessagesFrom === "nobody") {
        throw new AppError("This user doesn't allow messages", 403);
      }

      // Only friends are allowed
      if (allowMessagesFrom === "friends") {
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          senderId,
          recipientId,
        );
        if (!areFriends) {
          throw new AppError(
            "You must be friends with this user to send messages",
            403,
          );
        }
        return next();
      }

      // Friends of friends are allowed
      if (allowMessagesFrom === "friends_of_friends") {
        // First check if they're direct friends
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          senderId,
          recipientId,
        );
        if (areFriends) {
          return next();
        }

        // If not direct friends, check for mutual friends
        const haveMutualFriends =
          await FriendshipService.checkIfUsersHaveMutualFriends(
            senderId,
            recipientId,
          );
        if (!haveMutualFriends) {
          throw new AppError(
            "You need to have mutual friends with this user to send messages",
            403,
          );
        }
        return next();
      }

      // Default to restrictive if setting is unknown
      throw new AppError("You don't have permission to message this user", 403);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Apply message retention policy based on user preferences
   */
  static applyMessageRetentionPolicy = async (
    req: Request,
    res: Response,
    next: NextFunction,
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

      // Get retention policies
      const senderRetention =
        senderSettings.settings.messagePrivacy?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;
      const recipientRetention =
        recipientSettings.settings.messagePrivacy?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;

      // Apply the strictest policy (shortest retention period)
      // This ensures we respect both users' privacy preferences
      let retentionPolicy = senderRetention;

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

      // Apply strictest policy
      const senderIndex = retentionHierarchy.indexOf(senderRetention);
      const recipientIndex = retentionHierarchy.indexOf(recipientRetention);

      if (senderIndex >= 0 && recipientIndex >= 0) {
        retentionPolicy =
          retentionHierarchy[Math.min(senderIndex, recipientIndex)];
      }

      // Attach the determined retention policy to the request for use in the controller
      res.locals.messageRetentionPolicy = retentionPolicy;

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
    next: NextFunction,
  ) => {
    try {
      const userId = req.user?.id as UUID;
      const messageId = req.params.messageId || req.body.messageId;

      if (!userId || !messageId) {
        return next(new AppError("User ID or message ID missing", 400));
      }

      // Get message details to find the original sender
      const message = await req.app.locals.db.messages.findOne({
        id: messageId,
      });

      if (!message) {
        return next(new AppError("Message not found", 404));
      }

      // Check if user is part of the conversation
      if (
        message.sender_id !== userId &&
        !(await isUserInChat(userId, message.chat_id))
      ) {
        return next(new AppError("You don't have access to this message", 403));
      }

      // Get sender's privacy settings
      const senderSettings =
        await PrivacySettingsService.getUserPrivacySettings(message.sender_id);

      // Check if forwarding is allowed
      if (!senderSettings.settings.messagePrivacy?.allowForwarding) {
        return next(
          new AppError(
            "The sender doesn't allow forwarding of their messages",
            403,
          ),
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a user can view another user's profile
   */
  static canViewProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { userId, targetId } = await getRequiredIds(req, ["targetId"]);

      // Same user can always view their own profile
      if (userId === targetId) {
        return next();
      }

      // Get target user's privacy settings
      const targetSettings =
        await PrivacySettingsService.getUserPrivacySettings(targetId);
      const visibility = targetSettings.settings.baseSettings.profileVisibility;

      // Public profiles are visible to everyone
      if (visibility === "public") {
        return next();
      }

      // For friends-only or private profiles, check friendship
      if (visibility === "friends") {
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          userId,
          targetId,
        );
        if (!areFriends) {
          throw new AppError("This profile is only visible to friends", 403);
        }
        return next();
      }

      // Private profiles not visible to others
      if (visibility === "private") {
        throw new AppError("This profile is private", 403);
      }

      throw new AppError("Unable to determine profile visibility", 500);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a user can tag another user
   */
  static canTagUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { targetId } = await getRequiredIds(req, ["targetId"]);

      // Get target user's privacy settings
      const targetSettings =
        await PrivacySettingsService.getUserPrivacySettings(targetId);

      // Check if user allows tagging
      if (!targetSettings.settings.allowTagging) {
        throw new AppError("This user doesn't allow tagging", 403);
      }

      // For extra security, you might want to check friendship status too

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Apply various privacy checks based on operation type
   */
  static enforce = (
    operationType:
      | "message"
      | "viewProfile"
      | "tag"
      | "messageRetention"
      | "forwardMessage",
  ) => {
    switch (operationType) {
      case "message":
        return this.canSendMessage;
      case "viewProfile":
        return this.canViewProfile;
      case "tag":
        return this.canTagUser;
      case "messageRetention":
        return this.applyMessageRetentionPolicy;
      case "forwardMessage":
        return this.canForwardMessage;
      default:
        return (req: Request, res: Response, next: NextFunction) => {
          next(
            new AppError(
              `Unknown privacy operation type: ${operationType}`,
              500,
            ),
          );
        };
    }
  };
}

// Helper function to check if a user is part of a chat
async function isUserInChat(userId: UUID, chatId: UUID): Promise<boolean> {
  try {
    // Check if the user is a participant in the chat
    const { data, error } = await supabase
      .from("chat_participants")
      .select("id")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("Error checking chat participation:", error);
      return false;
    }

    // If data exists, the user is a participant
    return data !== null;
  } catch (error) {
    logger.error("Error in isUserInChat:", error);
    return false;
  }
}
