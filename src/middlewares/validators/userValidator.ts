// src/middlewares/validators/userValidator.ts
import { check, query } from "express-validator";
import { validateRequest } from "./validateRequest";
import { UserRole } from "../../types/models";

/**
 * Validation rules for creating a user
 */
export const validateCreateUser = [
  // Email validation
  check("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  // Password validation
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),

  // Name validation
  check("first_name")
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 2 })
    .withMessage("First name must be at least 2 characters long")
    .trim(),

  check("last_name")
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2 })
    .withMessage("Last name must be at least 2 characters long")
    .trim(),

  // Username validation
  check("username")
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters long")
    .matches(/^[a-zA-Z0-9_\\.]+$/)
    .withMessage(
      "Username can only contain letters, numbers, underscores and dots",
    )
    .trim(),

  // Role validation
  check("role")
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage("Invalid user role"),

  // Apply validation
  validateRequest,
];

/**
 * Validation rules for updating a user
 */
export const validateUpdateUser = [
  // First name validation (optional)
  check("first_name")
    .optional()
    .isLength({ min: 2 })
    .withMessage("First name must be at least 2 characters long")
    .trim(),

  // Last name validation (optional)
  check("last_name")
    .optional()
    .isLength({ min: 2 })
    .withMessage("Last name must be at least 2 characters long")
    .trim(),

  // Username validation (optional)
  check("username")
    .optional()
    .isLength({ min: 3 })
    .withMessage("Username must be at least 3 characters long")
    .matches(/^[a-zA-Z0-9_\\.]+$/)
    .withMessage(
      "Username can only contain letters, numbers, underscores and dots",
    )
    .trim(),

  // Bio validation (optional)
  check("bio")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Bio cannot exceed 500 characters"),

  // Location validation (optional)
  check("location").optional().trim(),

  // Contact info validation (optional)
  check("contact_info").optional().isObject().withMessage("Must be an object"),

  // Role validation (optional)
  check("role")
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage("Invalid user role"),

  // Is verified validation (optional)
  check("is_verified")
    .optional()
    .isBoolean()
    .withMessage("is_verified must be a boolean"),

  // Is active validation (optional)
  check("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be a boolean"),

  // Settings validation (optional)
  check("settings").optional().isObject().withMessage("Must be an object"),

  // Apply validation
  validateRequest,
];

/**
 * Validation rules for user search and filter parameters
 */
export const validateUserSearch = [
  // Query parameters validation
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("search")
    .optional()
    .isString()
    .withMessage("Search term must be a string")
    .trim(),

  query("role")
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage("Invalid user role"),

  query("is_verified")
    .optional()
    .isBoolean()
    .withMessage("is_verified must be a boolean")
    .toBoolean(),

  query("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be a boolean")
    .toBoolean(),

  query("sort_by")
    .optional()
    .isIn([
      "created_at",
      "updated_at",
      "first_name",
      "last_name",
      "username",
      "email",
    ])
    .withMessage("Invalid sort field"),

  query("order")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Order must be 'asc' or 'desc'"),

  // Apply validation
  validateRequest,
];
