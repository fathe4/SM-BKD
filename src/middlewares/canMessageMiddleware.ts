// src/middlewares/canMessageMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";
import { logger } from "../utils/logger";

/**
 * Middleware to check if a user can send a message to another user
 *
 * This middleware expects the recipient ID to be in req.params.recipientId,
 * req.params.userId, or req.body.recipientId
 */
export const canMessageMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({
        status: "fail",
        message: "Authentication required",
      });
    }

    // Find the recipient ID from the various possible sources
    const recipientId =
      req.params.recipientId || req.params.userId || req.body.recipientId;

    if (!recipientId) {
      return res.status(400).json({
        status: "fail",
        message: "Recipient ID is required",
      });
    }

    // Check if recipient exists and is active
    const { data: recipient, error: userError } = await supabase
      .from("users")
      .select("id, is_active, settings")
      .eq("id", recipientId)
      .single();

    if (userError || !recipient) {
      return res.status(404).json({
        status: "fail",
        message: "Recipient not found",
      });
    }

    if (!recipient.is_active) {
      return res.status(403).json({
        status: "fail",
        message: "This user's account is inactive",
      });
    }

    // Check recipient's privacy settings
    const settings = recipient.settings || {};
    const privacySettings = settings.privacy || {};

    // If recipient only allows messages from friends, check friendship status
    if (privacySettings.allowMessagesFrom === "friends") {
      const { data: friendship, error: friendshipError } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${senderId},addressee_id.eq.${recipientId}),and(requester_id.eq.${recipientId},addressee_id.eq.${senderId})`
        )
        .eq("status", "accepted")
        .maybeSingle();

      if (friendshipError || !friendship) {
        return res.status(403).json({
          status: "fail",
          message:
            "You cannot message this user because they only accept messages from friends",
        });
      }
    }

    // If recipient has blocked the sender, prevent messaging
    const { data: blockship } = await supabase
      .from("friendships")
      .select("status")
      .or(
        `and(requester_id.eq.${senderId},addressee_id.eq.${recipientId}),and(requester_id.eq.${recipientId},addressee_id.eq.${senderId})`
      )
      .eq("status", "blocked")
      .maybeSingle();

    if (blockship) {
      return res.status(403).json({
        status: "fail",
        message: "You cannot message this user",
      });
    }

    // If we reach here, the sender can message the recipient
    // Store recipient ID in res.locals for use in the route handler
    res.locals.recipientId = recipientId;

    next();
  } catch (error) {
    logger.error("Error in canMessageMiddleware:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while checking messaging permissions",
    });
  }
};
