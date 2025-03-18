import { Request, Response } from "express";
import { logger } from "../utils/logger";

export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response
) => {
  // Default error status
  let statusCode = 500;
  let status = "error";
  let message = "Something went wrong";
  let stack: string | undefined = undefined;

  // If it's our custom error, use its properties
  if ("statusCode" in err) {
    statusCode = err.statusCode;
    status = err.status;
    message = err.message;
  } else {
    // This is an unknown error
    message = err.message;
  }

  // In development, include the stack trace
  if (process.env.NODE_ENV === "development") {
    stack = err.stack;
  }

  // Log the error
  logger.error(
    `${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`
  );
  if (stack) {
    logger.error(stack);
  }

  // Send the error response
  res.status(statusCode).json({
    status,
    message,
    stack: process.env.NODE_ENV === "development" ? stack : undefined,
  });
};
