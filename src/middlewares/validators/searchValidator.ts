// src/middlewares/validators/searchValidator.ts
import { query, body } from "express-validator";
import { validateRequest } from "./validateRequest";

/**
 * Validation rules for basic user search
 */
export const validateBasicSearch = [
  // Search query validation
  query("q")
    .notEmpty()
    .withMessage("Search query is required")
    .isString()
    .withMessage("Search query must be a string")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Search query must be between 2 and 50 characters"),

  // Page validation
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  // Limit validation
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  // Sort by validation
  query("sortBy")
    .optional()
    .isIn(["relevance", "name", "newest"])
    .withMessage("Sort by must be one of: relevance, name, newest"),

  validateRequest,
];

/**
 * Validation rules for advanced user search
 */
export const validateAdvancedSearch = [
  // Optional text query validation
  body("query")
    .optional()
    .isString()
    .withMessage("Query must be a string")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Query must be between 2 and 50 characters"),

  // Location validation
  body("location")
    .optional()
    .isString()
    .withMessage("Location must be a string")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Location must be between 2 and 100 characters"),

  // Interests validation
  body("interests")
    .optional()
    .isArray()
    .withMessage("Interests must be an array")
    .custom((interests) => {
      if (interests.length === 0) return true;

      if (interests.length > 10) {
        throw new Error("Maximum 10 interests allowed");
      }

      // Check each interest is a string and properly formatted
      for (const interest of interests) {
        if (typeof interest !== "string" || interest.trim().length === 0) {
          throw new Error("Each interest must be a non-empty string");
        }
        if (interest.length > 30) {
          throw new Error("Each interest must be maximum 30 characters");
        }
      }

      return true;
    }),

  // Age range validation
  body("ageRange")
    .optional()
    .isObject()
    .withMessage("Age range must be an object"),

  body("ageRange.min")
    .optional()
    .isInt({ min: 13, max: 120 })
    .withMessage("Minimum age must be between 13 and 120"),

  body("ageRange.max")
    .optional()
    .isInt({ min: 13, max: 120 })
    .withMessage("Maximum age must be between 13 and 120")
    .custom((max, { req }) => {
      const min = req.body.ageRange?.min;
      if (min !== undefined && max < min) {
        throw new Error(
          "Maximum age must be greater than or equal to minimum age",
        );
      }
      return true;
    }),

  // Sort by validation
  body("sortBy")
    .optional()
    .isIn(["relevance", "name", "newest"])
    .withMessage("Sort by must be one of: relevance, name, newest"),

  // Page validation
  body("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  // Limit validation
  body("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  validateRequest,
];

/**
 * Validation rules for nearby users search
 */
export const validateNearbySearch = [
  // Radius validation
  query("radius")
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage("Radius must be between 0.1 and 100 kilometers"),

  // Page validation
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  // Limit validation
  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  validateRequest,
];
