// src/middlewares/validators/postValidator.ts
import { check } from "express-validator";
import { validateRequest } from "./validateRequest";
import {
  PostVisibility,
  PostFeelingType,
  MediaType,
} from "../../models/post.model";

/**
 * Validation for creating a post
 */
export const validateCreatePost = [
  // Content validation - either content or media is required
  check("content")
    .optional()
    .isString()
    .withMessage("Content must be a string")
    .isLength({ max: 5000 })
    .withMessage("Content cannot exceed 5000 characters"),

  // Media validation
  check("media").optional().isArray().withMessage("Media must be an array"),

  check("media.*.url")
    .optional()
    .isURL()
    .withMessage("Media URL must be a valid URL"),

  check("media.*.type")
    .optional()
    .isIn(Object.values(MediaType))
    .withMessage("Invalid media type"),

  // Validate that at least content or media is provided
  check().custom((value, { req }) => {
    if (!req.body.content && (!req.body.media || req.body.media.length === 0)) {
      throw new Error("A post must contain either content or media");
    }
    return true;
  }),

  // Feeling validation
  check("feeling")
    .optional()
    .isIn(Object.values(PostFeelingType))
    .withMessage("Invalid feeling type"),

  // Visibility validation
  check("visibility")
    .optional()
    .isIn(Object.values(PostVisibility))
    .withMessage("Invalid visibility setting"),

  // Location validation if provided
  check("location")
    .optional()
    .isObject()
    .withMessage("Location must be an object"),

  check("location.name")
    .optional()
    .isString()
    .withMessage("Location name must be a string"),

  check("location.coordinates")
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage("Coordinates must be an array with exactly 2 values"),

  validateRequest,
];

/**
 * Validation for updating a post
 */
export const validateUpdatePost = [
  // Content validation
  check("content")
    .optional()
    .isString()
    .withMessage("Content must be a string")
    .isLength({ max: 5000 })
    .withMessage("Content cannot exceed 5000 characters"),

  // Feeling validation
  check("feeling")
    .optional()
    .isIn(Object.values(PostFeelingType))
    .withMessage("Invalid feeling type"),

  // Visibility validation
  check("visibility")
    .optional()
    .isIn(Object.values(PostVisibility))
    .withMessage("Invalid visibility setting"),

  // Location validation if provided
  check("location")
    .optional()
    .isObject()
    .withMessage("Location must be an object"),

  check("location.name")
    .optional()
    .isString()
    .withMessage("Location name must be a string"),

  check("location.coordinates")
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage("Coordinates must be an array with exactly 2 values"),

  validateRequest,
];
