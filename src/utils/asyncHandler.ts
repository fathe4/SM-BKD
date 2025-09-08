// src/utils/asyncHandler.ts
import { AppError } from "../middlewares/errorHandler";
import { logger } from "./logger";

/**
 * A utility function to handle async operations with consistent error handling
 *
 * @param fn The async function to execute
 * @param errorMessage Default error message if not an AppError
 * @returns A function with the same signature but with error handling
 */
export const asyncHandler = <T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  errorMessage: string,
) => {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`${errorMessage}:`, error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        error instanceof Error ? error.message : errorMessage,
        500,
      );
    }
  };
};
