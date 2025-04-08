import { ExtendedError, Socket } from "socket.io";
import { logger } from "../../utils/logger";

// Simple in-memory rate limiter - for production, consider using Redis
const rateLimits = new Map<string, { count: number; resetTime: number }>();

// Rate limit settings
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_CONNECTIONS_PER_WINDOW = 5;

/**
 * Socket.IO middleware for rate limiting
 */
export const rateLimiterMiddleware = (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  const ip = socket.handshake.address;
  const now = Date.now();

  // Get or create rate limit entry
  let rateLimitEntry = rateLimits.get(ip);
  if (!rateLimitEntry || now > rateLimitEntry.resetTime) {
    rateLimitEntry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimits.set(ip, rateLimitEntry);
  }

  // Increment connection count
  rateLimitEntry.count++;

  // Check if over limit
  if (rateLimitEntry.count > MAX_CONNECTIONS_PER_WINDOW) {
    logger.warn(`Rate limit exceeded for IP ${ip}`);
    return next(new Error("Too many connection attempts. Try again later."));
  }

  next();
};
