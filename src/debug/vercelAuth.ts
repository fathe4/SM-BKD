// src/debug/vercelAuth.ts
import { Router } from "express";
import { logger } from "../utils/logger";

const router = Router();

// Public health check that doesn't require auth
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    env: {
      // Only expose safe environment variables
      NODE_ENV: process.env.NODE_ENV,
      HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
      HAS_SUPABASE_KEY: !!process.env.SUPABASE_KEY,
      HAS_JWT_SECRET: !!process.env.JWT_SECRET,
    },
  });
});

// Debug endpoint to log request headers
router.get("/debug-headers", (req, res) => {
  logger.info("Debug headers:", req.headers);

  res.status(200).json({
    status: "success",
    headers: req.headers,
  });
});

export default router;
