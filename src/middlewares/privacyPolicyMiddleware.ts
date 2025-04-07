/* eslint-disable indent */
// src/middlewares/privacyPolicyMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { UUID } from "crypto";
import { AppError } from "./errorHandler";
import { FriendshipService } from "../services/friendshipService";
import { PrivacySettingsService } from "../services/privacySettingsService";

/**
 * Middleware to enforce privacy policies for various operations
 */
export class PrivacyPolicyMiddleware {
  /**
   * Check if a user can send messages to another user
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
      const allowMessagesFrom = recipientSettings.settings.allowMessagesFrom;

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

      // Friends of friends are allowed
      if (allowMessagesFrom === "friends_of_friends") {
        // First check if they're direct friends
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          senderId,
          recipientId
        );
        if (areFriends) {
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

      // Default to restrictive if setting is unknown
      throw new AppError("You don't have permission to message this user", 403);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a user's profile can be viewed by the current user
   */
  static canViewProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const viewerId = req.user?.id as UUID;
      const profileId = req.params.userId || req.body.userId;

      // Skip check if viewing own profile
      if (viewerId === profileId) {
        return next();
      }

      // Get profile owner's privacy settings
      const profileSettings =
        await PrivacySettingsService.getUserPrivacySettings(profileId);
      const profileVisibility =
        profileSettings.settings.baseSettings.profileVisibility;

      // Public profiles can be viewed by anyone
      if (profileVisibility === "public") {
        return next();
      }

      // Private profiles can only be viewed by friends
      if (profileVisibility === "private") {
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          viewerId,
          profileId
        );
        if (!areFriends) {
          throw new AppError("This profile is private", 403);
        }
        return next();
      }

      // Friends-only profiles
      if (profileVisibility === "friends") {
        const areFriends = await FriendshipService.checkIfUsersAreFriends(
          viewerId,
          profileId
        );
        if (!areFriends) {
          throw new AppError("This profile is only visible to friends", 403);
        }
        return next();
      }

      // Default to restrictive if setting is unknown
      throw new AppError("You don't have permission to view this profile", 403);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Check if a user can be tagged by the current user
   */
  static canTagUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const taggerId = req.user?.id as UUID;
      const targetId =
        req.params.userId || req.body.userId || req.body.taggedUserId;

      // Skip check if tagging self
      if (taggerId === targetId) {
        return next();
      }

      // Get target's privacy settings
      const targetSettings =
        await PrivacySettingsService.getUserPrivacySettings(targetId);
      const allowTagging = targetSettings.settings.allowTagging;

      if (!allowTagging) {
        throw new AppError("This user doesn't allow tagging", 403);
      }

      return next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Apply various privacy checks based on operation type
   */
  static enforce = (operationType: "message" | "viewProfile" | "tag") => {
    switch (operationType) {
      case "message":
        return this.canSendMessage;
      case "viewProfile":
        return this.canViewProfile;
      case "tag":
        return this.canTagUser;
      default:
        return (req: Request, res: Response, next: NextFunction) => {
          next(
            new AppError(
              `Unknown privacy operation type: ${operationType}`,
              500
            )
          );
        };
    }
  };
}
