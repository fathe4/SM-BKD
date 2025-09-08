/* eslint-disable indent */
// src/middlewares/chatPrivacyMiddleware.ts

import { Request, Response, NextFunction } from "express";
import {
  canSeeOnlineStatus,
  canSeeLastActive,
  shouldSendReadReceipt,
} from "../utils/chatPrivacy";
import {
  getRequiredIds,
  getPrivacySettingsForUsers,
} from "../utils/privacyHelpers";
import { FriendshipService } from "../services/friendshipService";
import { AppError } from "./errorHandler";
import { PrivacySettingsService } from "../services/privacySettingsService";
import { UUID } from "crypto";

export class ChatPrivacyMiddleware {
  /**
   * Factory method to create middleware for various chat privacy checks
   */
  static check(checkType: "onlineStatus" | "lastActive" | "readReceipt") {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId, targetId } = await getRequiredIds(req, ["targetId"]);
        const settings = await getPrivacySettingsForUsers([userId, targetId]);

        let allowed = false;

        switch (checkType) {
          case "onlineStatus":
            allowed = await canSeeOnlineStatus(
              userId,
              targetId,
              settings[targetId],
            );
            break;
          case "lastActive":
            allowed = await canSeeLastActive(
              userId,
              targetId,
              settings[targetId],
            );
            break;
          case "readReceipt":
            allowed = shouldSendReadReceipt(
              settings[userId],
              settings[targetId],
            );
            break;
        }

        if (!allowed) {
          // Instead of throwing error, just set a flag in res.locals
          res.locals[checkType + "Visible"] = false;
        } else {
          res.locals[checkType + "Visible"] = true;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  static canAddParticipants = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = req.user?.id as UUID;
      const { participants } = req.body;

      if (!participants || !Array.isArray(participants)) {
        return next(new AppError("Invalid participants data", 400));
      }

      // Check each participant's privacy settings
      for (const participantId of participants) {
        const targetSettings =
          await PrivacySettingsService.getUserPrivacySettings(participantId);
        const allowMessagesFrom =
          targetSettings.settings.messageSettings?.allowMessagesFrom ||
          "everyone";

        if (allowMessagesFrom === "nobody") {
          return next(
            new AppError(`User ${participantId} doesn't allow messages`, 403),
          );
        }

        if (allowMessagesFrom === "friends") {
          const areFriends = await FriendshipService.checkIfUsersAreFriends(
            userId,
            participantId,
          );
          if (!areFriends) {
            return next(
              new AppError(
                `You must be friends with user ${participantId} to add them to a chat`,
                403,
              ),
            );
          }
        }

        if (allowMessagesFrom === "friends_of_friends") {
          const areFriends = await FriendshipService.checkIfUsersAreFriends(
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
              return next(
                new AppError(
                  `You need to have mutual friends with user ${participantId}`,
                  403,
                ),
              );
            }
          }
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
