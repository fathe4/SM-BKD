// src/middlewares/ipExtractor.ts
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export const extractClientInfo = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Extract IP address
  let ipAddress = req.ip || "";

  // Try to get IP from proxy headers if available
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor && typeof forwardedFor === "string") {
    ipAddress = forwardedFor.split(",")[0].trim();
  }

  // Check if it's a local/private IP
  if (
    ipAddress === "127.0.0.1" ||
    ipAddress === "localhost" ||
    ipAddress === "::1" ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.")
  ) {
    logger.debug(`Detected local/private IP: ${ipAddress}`);

    // For development/testing, you can set a mock IP
    // ipAddress = "8.8.8.8"; // Uncomment to use Google's DNS as mock IP for testing

    // Still set up the clientInfo but mark it as local
    res.locals.clientInfo = {
      ipAddress,
      deviceToken: "local-development-device",
      deviceType: "development",
      userAgent: req.headers["user-agent"] || "development",
      isLocalIp: true,
    };

    // Continue to next middleware
    return next();
  }

  // Extract device information from headers
  const userAgent = req.headers["user-agent"] || "unknown";

  // Generate a device token
  const deviceToken = `${req.headers["sec-ch-ua"] || ""}-${userAgent.substring(
    0,
    50,
  )}`;

  // Determine device type based on user-agent
  let deviceType = "web";
  if (/mobile|android|iphone|ipad|ipod/i.test(userAgent.toLowerCase())) {
    deviceType = "mobile";
  } else if (/tablet/i.test(userAgent.toLowerCase())) {
    deviceType = "tablet";
  }

  // Use res.locals instead of req.clientInfo
  res.locals.clientInfo = {
    ipAddress,
    deviceToken,
    deviceType,
    userAgent,
    isLocalIp: false,
  };

  next();
};
