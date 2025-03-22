// src/utils/controllerHandler.ts
import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

/**
 * Utility to handle async controller methods with consistent error handling
 */
export const controllerHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      logger.error("Controller error:", error);
      next(error);
    }
  };
};
