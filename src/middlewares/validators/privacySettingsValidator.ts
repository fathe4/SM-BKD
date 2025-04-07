// src/middlewares/validators/privacySettingsValidator.ts

import { body } from "express-validator";
import { validateRequest } from "./validateRequest";
import {
  MessageRetentionPeriod,
  ALLOW_LEVELS,
  VISIBILITY_LEVELS,
} from "../../models/privacy-settings.model";

const retentionPeriods = Object.values(MessageRetentionPeriod);

// Validation rules for the base privacy settings
const baseSettingsRules = [
  body("profileVisibility")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(
      `Profile visibility must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    ),

  body("showOnlineStatus")
    .optional()
    .isBoolean()
    .withMessage("Show online status must be a boolean"),

  body("showLastActive")
    .optional()
    .isBoolean()
    .withMessage("Show last active must be a boolean"),
];

// Validation rules for message privacy settings
const messageSettingsRules = [
  body("allowMessagesFrom")
    .optional()
    .isIn(ALLOW_LEVELS)
    .withMessage(
      `Allow messages from must be one of: ${ALLOW_LEVELS.join(", ")}`
    ),

  body("messageRetentionPeriod")
    .optional()
    .isIn(retentionPeriods)
    .withMessage(
      `Message retention period must be one of: ${retentionPeriods.join(", ")}`
    ),

  body("allowMessageReadReceipts")
    .optional()
    .isBoolean()
    .withMessage("Allow message read receipts must be a boolean"),

  body("allowForwarding")
    .optional()
    .isBoolean()
    .withMessage("Allow forwarding must be a boolean"),

  body("allowReplies")
    .optional()
    .isBoolean()
    .withMessage("Allow replies must be a boolean"),
];

// Validation rules for the full privacy settings object
const fullSettingsRules = [
  body("settings.baseSettings")
    .optional()
    .isObject()
    .withMessage("Base settings must be an object"),

  body("settings.allowFriendRequests")
    .optional()
    .isIn(ALLOW_LEVELS)
    .withMessage(
      `Allow friend requests must be one of: ${ALLOW_LEVELS.join(", ")}`
    ),

  body("settings.allowTagging")
    .optional()
    .isBoolean()
    .withMessage("Allow tagging must be a boolean"),

  body("settings.showInSearch")
    .optional()
    .isBoolean()
    .withMessage("Show in search must be a boolean"),

  body("settings.showBirthDate")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(
      `Show birthdate must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    ),

  body("settings.showLocation")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(
      `Show location must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    ),

  body("settings.showEmail")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(`Show email must be one of: ${VISIBILITY_LEVELS.join(", ")}`),

  body("settings.postsDefaultVisibility")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(
      `Posts default visibility must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    ),

  body("settings.showFriendsList")
    .optional()
    .isIn(VISIBILITY_LEVELS)
    .withMessage(
      `Show friends list must be one of: ${VISIBILITY_LEVELS.join(", ")}`
    ),

  body("settings.twoFactorAuthEnabled")
    .optional()
    .isBoolean()
    .withMessage("Two factor auth enabled must be a boolean"),

  body("settings.loginNotifications")
    .optional()
    .isBoolean()
    .withMessage("Login notifications must be a boolean"),

  body("settings.messageSettings")
    .optional()
    .isObject()
    .withMessage("Message settings must be an object"),

  body("settings.messageSettings.allowMessagesFrom")
    .optional()
    .isIn(ALLOW_LEVELS)
    .withMessage(
      `Allow messages from must be one of: ${ALLOW_LEVELS.join(", ")}`
    ),

  body("settings.messageSettings.messageRetentionPeriod")
    .optional()
    .isIn(retentionPeriods)
    .withMessage(
      `Message retention period must be one of: ${retentionPeriods.join(", ")}`
    ),

  body("settings.messageSettings.allowMessageReadReceipts")
    .optional()
    .isBoolean()
    .withMessage("Allow message read receipts must be a boolean"),

  body("settings.messageSettings.allowForwarding")
    .optional()
    .isBoolean()
    .withMessage("Allow forwarding must be a boolean"),

  body("settings.messageSettings.allowReplies")
    .optional()
    .isBoolean()
    .withMessage("Allow replies must be a boolean"),
];

export const validatePrivacySettings = {
  baseSettings: [...baseSettingsRules, validateRequest],
  messageSettings: [...messageSettingsRules, validateRequest],
  fullSettings: [...fullSettingsRules, validateRequest],
};
