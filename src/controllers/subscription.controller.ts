import { Request, Response } from "express";
import {
  getUserSubscriptions,
  getSubscriptionTiers,
  getUserSubscriptionStatus,
} from "../services/subscriptionService";

export class SubscriptionController {
  /**
   * Get all subscriptions for the authenticated user
   */
  static async getUserSubscriptions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated." });
      }
      const subscriptions = await getUserSubscriptions(userId);
      res.status(200).json({ data: { subscriptions } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user subscriptions." });
    }
  }

  /**
   * Get all available subscription tiers
   */
  static async getSubscriptionTiers(req: Request, res: Response) {
    try {
      const tiers = await getSubscriptionTiers();
      res.status(200).json({ data: { tiers } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscription tiers." });
    }
  }

  /**
   * Get the current user's subscription status
   */
  static async getUserSubscriptionStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated." });
      }
      const status = await getUserSubscriptionStatus(userId);
      res.status(200).json({ data: status });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscription status." });
    }
  }
}
