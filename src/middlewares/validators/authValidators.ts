import { logger } from "../../utils/logger";
import { Request, Response, NextFunction } from "express";
import { check, validationResult } from "express-validator";

/**
 * Validation middleware for forgot password
 */
export const validateForgotPassword = [
  // Email validation
  check("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

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
 * Validation middleware for reset password
 */
export const validateResetPassword = [
  // Token validation
  check("token")
    .notEmpty()
    .withMessage("Reset token is required")
    .isString()
    .withMessage("Token must be a string")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format"),

  // Password validation
  check("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),

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
 * Validation middleware for verify reset token
 */
export const validateVerifyResetToken = [
  // Token validation (param)
  check("token")
    .notEmpty()
    .withMessage("Reset token is required")
    .isString()
    .withMessage("Token must be a string")
    .isLength({ min: 64, max: 64 })
    .withMessage("Invalid token format"),

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

