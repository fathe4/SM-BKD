// src/middlewares/validators/messageValidator.ts
import { body, param } from "express-validator";
import { validateRequest } from "./validateRequest";

/**
 * Validation rules for creating a message
 */
export const validateCreateMessage = [
  // Chat ID validation
  body("chatId")
    .notEmpty()
    .withMessage("Chat ID is required")
    .isUUID()
    .withMessage("Chat ID must be a valid UUID"),

  // Content validation (required if no media)
  body("content")
    .custom((value, { req }) => {
      // Either content or media must be provided
      if (!value && (!req.body.media || req.body.media.length === 0)) {
        throw new Error("Message must contain either content or media");
      }
      return true;
    })
    .optional()
    .isString()
    .withMessage("Content must be a string")
    .isLength({ max: 10000 })
    .withMessage("Content cannot exceed 10000 characters"),

  // Media validation
  body("media").optional().isArray().withMessage("Media must be an array"),

  body("media.*.url")
    .optional()
    .isURL()
    .withMessage("Media URL must be a valid URL"),

  body("media.*.type")
    .optional()
    .isIn(["image", "video", "audio", "document"])
    .withMessage("Invalid media type"),

  // Reply to message ID validation
  body("replyToId")
    .optional()
    .isUUID()
    .withMessage("Reply to ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation rules for forwarding a message
 */
export const validateForwardMessage = [
  // Message ID validation
  param("messageId")
    .notEmpty()
    .withMessage("Message ID is required")
    .isUUID()
    .withMessage("Message ID must be a valid UUID"),

  // Target chat ID validation
  body("targetChatId")
    .notEmpty()
    .withMessage("Target chat ID is required")
    .isUUID()
    .withMessage("Target chat ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation rules for reading a message
 */
export const validateReadMessage = [
  // Message ID validation
  param("messageId")
    .notEmpty()
    .withMessage("Message ID is required")
    .isUUID()
    .withMessage("Message ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation rules for deleting a message
 */
export const validateDeleteMessage = [
  // Message ID validation
  param("messageId")
    .notEmpty()
    .withMessage("Message ID is required")
    .isUUID()
    .withMessage("Message ID must be a valid UUID"),

  validateRequest,
];
