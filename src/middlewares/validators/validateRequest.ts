// src/middlewares/validators/validateRequest.ts
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { logger } from "../../utils/logger";

/**
 * Common validation result handler for all validators
 */
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
};
