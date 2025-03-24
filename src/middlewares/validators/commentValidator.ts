// Update the validators in src/middlewares/validators/commentValidator.ts

import { check } from "express-validator";
import { validateRequest } from "./validateRequest";

/**
 * Validation rules for creating a comment
 */
export const validateCreateComment = [
  // Content validation
  check("content")
    .notEmpty()
    .withMessage("Comment content is required")
    .isLength({ max: 1000 })
    .withMessage("Comment content cannot exceed 1000 characters"),

  // Parent comment ID validation (optional for replies)
  check("parent_id")
    .optional()
    .isUUID()
    .withMessage("Invalid parent comment ID format"),

  // Media validation (optional) - for existing media URLs
  check("media")
    .optional()
    .custom((value) => {
      try {
        // If media is provided, it should be valid JSON
        const media = JSON.parse(value);

        if (!Array.isArray(media)) {
          throw new Error("Media must be an array");
        }

        // Validate each media item
        media.forEach((item) => {
          if (!item.url || !item.type) {
            throw new Error("Each media item must have a url and type");
          }

          if (!["image", "video", "document"].includes(item.type)) {
            throw new Error("Invalid media type");
          }
        });

        return true;
      } catch (error: any) {
        throw new Error(`Invalid media format: ${error.message}`);
      }
    }),

  validateRequest,
];

/**
 * Validation rules for updating a comment
 */
export const validateUpdateComment = [
  // Content validation
  check("content")
    .notEmpty()
    .withMessage("Comment content is required")
    .isLength({ max: 1000 })
    .withMessage("Comment content cannot exceed 1000 characters"),

  // Media validation (optional) - for existing media URLs
  check("media")
    .optional()
    .custom((value) => {
      try {
        // If media is provided, it should be valid JSON
        const media = JSON.parse(value);

        if (!Array.isArray(media)) {
          throw new Error("Media must be an array");
        }

        // Validate each media item
        media.forEach((item) => {
          if (!item.url || !item.type) {
            throw new Error("Each media item must have a url and type");
          }

          if (!["image", "video", "document"].includes(item.type)) {
            throw new Error("Invalid media type");
          }
        });

        return true;
      } catch (error: any) {
        throw new Error(`Invalid media format: ${error.message}`);
      }
    }),

  validateRequest,
];
