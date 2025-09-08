import { logger } from "../../utils/logger";
import { Request, Response, NextFunction } from "express";
import { check, validationResult } from "express-validator";

/**
 * Validation middleware for user registration
 */
export const validateRegister = [
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

  // Device validation if provided
  check("device_token")
    .optional()
    .isString()
    .withMessage("Device token must be a string"),

  check("device_type")
    .optional()
    .isString()
    .withMessage("Device type must be a string"),

  // Coordinates validation if provided
  check("coordinates")
    .optional()
    .isArray()
    .withMessage("Coordinates must be an array")
    .custom((value) => {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(
          "Coordinates must be an array with 2 elements [longitude, latitude]",
        );
      }
      if (typeof value[0] !== "number" || typeof value[1] !== "number") {
        throw new Error("Coordinates must be numbers");
      }
      if (value[0] < -180 || value[0] > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }
      if (value[1] < -90 || value[1] > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }
      return true;
    }),

  // Validation handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors:", errors.array());
      return res.status(400).json({
        status: "fail",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    next();
  },
];

/**
 * Validation middleware for user login
 */
export const validateLogin = [
  // Email validation
  check("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  // Password validation
  check("password").notEmpty().withMessage("Password is required"),

  // Device validation if provided
  check("device_token")
    .optional()
    .isString()
    .withMessage("Device token must be a string"),

  check("device_type")
    .optional()
    .isString()
    .withMessage("Device type must be a string"),

  // Coordinates validation if provided
  check("coordinates")
    .optional()
    .isArray()
    .withMessage("Coordinates must be an array")
    .custom((value) => {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(
          "Coordinates must be an array with 2 elements [longitude, latitude]",
        );
      }
      if (typeof value[0] !== "number" || typeof value[1] !== "number") {
        throw new Error("Coordinates must be numbers");
      }
      if (value[0] < -180 || value[0] > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }
      if (value[1] < -90 || value[1] > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }
      return true;
    }),

  // Validation handler
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors:", errors.array());
      return res.status(400).json({
        status: "fail",
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    next();
  },
];
