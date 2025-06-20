import { body } from "express-validator";
import { validateRequest } from "./validateRequest";

/**
 * Validation rules for creating a chat
 */
export const validateCreateChat = [
  // is_group_chat validation
  body("is_group_chat")
    .isBoolean()
    .withMessage("is_group_chat must be a boolean"),

  // Name validation (required for group chats)
  body("name")
    .if(body("is_group_chat").equals("true"))
    .notEmpty()
    .withMessage("Name is required for group chats")
    .isString()
    .withMessage("Name must be a string")
    .isLength({ min: 1, max: 100 })
    .withMessage("Name must be between 1 and 100 characters"),

  // Description validation
  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string")
    .isLength({ max: 500 })
    .withMessage("Description cannot exceed 500 characters"),

  // Avatar validation
  body("avatar").optional().isURL().withMessage("Avatar must be a valid URL"),

  // Participants validation
  body("participants")
    .isArray({ min: 1 })
    .withMessage("At least one participant is required"),

  body("participants.*")
    .isUUID()
    .withMessage("Each participant ID must be a valid UUID"),

  body("first_message")
    .optional()
    .isString()
    .isLength({ min: 1, max: 2000 })
    .withMessage("First message must be a string"),

  validateRequest,
];

/**
 * Validation rules for updating a chat
 */
export const validateUpdateChat = [
  // Name validation
  body("name")
    .optional()
    .isString()
    .withMessage("Name must be a string")
    .isLength({ min: 1, max: 100 })
    .withMessage("Name must be between 1 and 100 characters"),

  // Description validation
  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string")
    .isLength({ max: 500 })
    .withMessage("Description cannot exceed 500 characters"),

  // Avatar validation
  body("avatar").optional().isURL().withMessage("Avatar must be a valid URL"),

  validateRequest,
];

/**
 * Validation rules for adding participants
 */
export const validateAddParticipants = [
  // Participants validation
  body("participants")
    .isArray({ min: 1 })
    .withMessage("At least one participant is required"),

  body("participants.*")
    .isUUID()
    .withMessage("Each participant ID must be a valid UUID"),

  validateRequest,
];
