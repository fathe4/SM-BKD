/* eslint-disable @typescript-eslint/no-namespace */
// src/types/express.d.ts
import "express";

declare global {
  namespace Express {
    interface Request {
      clientInfo?: {
        ipAddress: string;
        deviceToken: string;
        deviceType: string;
        userAgent: string;
      };
    }
  }
}
