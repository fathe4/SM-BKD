/* eslint-disable indent */
import winston from "winston";
import { config } from "dotenv";

config();

const logLevel = process.env.LOG_LEVEL || "info";
const env = process.env.NODE_ENV || "development";

// Define a custom filter format to keep only errors, warnings, startup logs, and direct actions (like, comment, friend request, greetings)
const filterInfoLogs = winston.format((info) => {
  const level = info.level.toLowerCase();
  if (level === "error" || level === "warn") {
    return info;
  }
  
  const msg = ((info as any).message || "").toString().toLowerCase();
  
  // Allow startup/system status logs
  if (
    msg.includes("initialize") || 
    msg.includes("starting") || 
    msg.includes("redis") || 
    msg.includes("socket.io") || 
    msg.includes("server running") ||
    msg.includes("server listening") ||
    msg.includes("express")
  ) {
    return info;
  }

  // Allow candidate choosing actions: like, comment, friend request, greetings, success
  const isInteraction = 
    msg.includes("like") || 
    msg.includes("comment") || 
    msg.includes("friend") || 
    msg.includes("greet") || 
    msg.includes("chat") || 
    msg.includes("success");
  
  if (isInteraction) {
    if (
      msg.includes("evaluating") || 
      msg.includes("scrolled") || 
      msg.includes("skipping") || 
      msg.includes("viewed post") || 
      msg.includes("pacing") || 
      msg.includes("slowdown") || 
      msg.includes("cooldown")
    ) {
      return false;
    }
    return info;
  }

  return false;
});

// Define the custom format for our logger
const logFormat = winston.format.combine(
  filterInfoLogs(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  env === "development"
    ? winston.format.colorize()
    : winston.format.uncolorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  }),
);

// Create the logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports:
    env === "production"
      ? [] // No transports in production (logger disabled)
      : [
          // Console transport
          new winston.transports.Console(),

          // File transport for errors
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
            maxsize: 5 * 1024 * 1024, // 5MB limit
            maxFiles: 3, // Keep at most 3 error log files, delete older ones
            tailable: true,
          }),

          // File transport for all logs
          new winston.transports.File({
            filename: "logs/combined.log",
            maxsize: 10 * 1024 * 1024, // 10MB limit
            maxFiles: 3, // Keep at most 3 combined log files, delete older ones
            tailable: true,
          }),
        ],
});

// Make sure logger methods don't throw errors when called in production
if (env === "production") {
  logger.silent = true;
}

// Stream for Morgan (HTTP request logger)
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// If we're in a test environment, silence the logger
if (process.env.NODE_ENV === "test") {
  logger.silent = true;
}
