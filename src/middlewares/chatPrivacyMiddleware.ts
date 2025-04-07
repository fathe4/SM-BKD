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
              settings[targetId]
            );
            break;
          case "lastActive":
            allowed = await canSeeLastActive(
              userId,
              targetId,
              settings[targetId]
            );
            break;
          case "readReceipt":
            allowed = shouldSendReadReceipt(
              settings[userId],
              settings[targetId]
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
}
