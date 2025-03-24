import { check, param } from "express-validator";
import { validateRequest } from "./validateRequest";
import { FriendshipStatus } from "../../models/friendship.model";

/**
 * Validation rules for sending a friend request
 */
export const validateFriendRequest = [
  check("addressee_id")
    .notEmpty()
    .withMessage("Addressee ID is required")
    .isUUID()
    .withMessage("Addressee ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation rules for updating friendship status
 */
export const validateFriendshipStatus = [
  param("id")
    .notEmpty()
    .withMessage("Friendship ID is required")
    .isUUID()
    .withMessage("Friendship ID must be a valid UUID"),

  check("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(Object.values(FriendshipStatus))
    .withMessage(
      `Status must be one of: ${Object.values(FriendshipStatus).join(", ")}`
    ),

  validateRequest,
];

/**
 * Validate friendship ID parameter
 */
export const validateFriendshipId = [
  param("id")
    .notEmpty()
    .withMessage("Friendship ID is required")
    .isUUID()
    .withMessage("Friendship ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation for mutual friends endpoint
 */
export const validateMutualFriendsRequest = [
  param("userId")
    .notEmpty()
    .withMessage("User ID is required")
    .isUUID()
    .withMessage("User ID must be a valid UUID"),

  validateRequest,
];

/**
 * Validation for friendship pagination parameters
 */
export const validateFriendshipPagination = [
  check("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  check("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  check("status")
    .optional()
    .isIn(Object.values(FriendshipStatus))
    .withMessage(
      `Status must be one of: ${Object.values(FriendshipStatus).join(", ")}`
    ),

  validateRequest,
];

export const validateUserId = [
  param("userId")
    .notEmpty()
    .withMessage("User ID is required")
    .isUUID()
    .withMessage("User ID must be a valid UUID"),
  validateRequest,
];
