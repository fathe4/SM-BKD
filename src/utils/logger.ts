import winston from "winston";
import { config } from "dotenv";

config();

const logLevel = process.env.LOG_LEVEL || "info";
const env = process.env.NODE_ENV || "development";

// Define the custom format for our logger
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  env === "development"
    ? winston.format.colorize()
    : winston.format.uncolorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Create the logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console(),

    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

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
