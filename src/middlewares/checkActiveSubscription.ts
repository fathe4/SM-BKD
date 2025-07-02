import { Request, Response, NextFunction } from "express";
import { getActiveSubscriptionForUser } from "../services/subscriptionService";

/**
 * Middleware to check if the authenticated user has an active, non-expired subscription.
 * Assumes req.user.id is set by a previous authentication middleware.
 * If the user does not have an active subscription, responds with 403.
 * If found, attaches the subscription to req.subscription and calls next().
 */
export const checkActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated." });
    }

    const subscription = await getActiveSubscriptionForUser(userId);
    if (!subscription) {
      return res.status(403).json({ error: "No active subscription found." });
    }

    (req as any).subscription = subscription;
    next();
  } catch (err) {
    console.error("[checkActiveSubscription] Error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};
