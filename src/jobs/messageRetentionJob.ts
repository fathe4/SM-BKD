// src/jobs/messageRetentionJob.ts
import { CronJob } from "cron";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../config/supabase";
import { MessageRetentionPeriod } from "../models/privacy-settings.model";

/**
 * Job to clean up expired messages based on retention policies
 */
export function setupMessageRetentionJob(): void {
  // Run daily at 3 AM
  const job = new CronJob("0 3 * * *", async () => {
    try {
      logger.info("Starting message retention job");

      // Clean up messages that have reached their auto_delete_at time
      const expiredCount = await cleanupExpiredMessages();
      logger.info(`Cleaned up ${expiredCount} expired messages`);

      // Clean up read messages with "after_read" retention policy
      const readMsgCount = await cleanupReadMessages();
      logger.info(
        `Cleaned up ${readMsgCount} read messages with after_read policy`,
      );
    } catch (error) {
      logger.error("Error in message retention job:", error);
    }
  });

  // Start the job
  job.start();
  logger.info("Message retention job scheduled");
}

/**
 * Delete messages that have reached their auto_delete_at time
 */
async function cleanupExpiredMessages(): Promise<number> {
  try {
    const now = new Date().toISOString();

    // Find messages that have reached their auto_delete_at time
    const { data, error } = await supabaseAdmin!
      .from("messages")
      .update({
        is_deleted: true,
        content: "[This message has expired]",
        media: [],
      })
      .lt("auto_delete_at", now)
      .eq("is_deleted", false);

    if (error) {
      logger.error("Error cleaning up expired messages:", error);
      return 0;
    }

    return (data as unknown as unknown[]).length || 0;
  } catch (error) {
    logger.error("Error in cleanupExpiredMessages:", error);
    return 0;
  }
}

/**
 * Find and delete read messages with AFTER_READ retention policy
 *
 * This is more complex because we need to:
 * 1. Find messages that have been read
 * 2. Check the sender's privacy settings
 * 3. Apply the AFTER_READ policy if that's what they have set
 */
async function cleanupReadMessages(): Promise<number> {
  try {
    // Get all read messages
    const { data: readMessages, error: readError } = await supabaseAdmin!
      .from("messages")
      .select("id, sender_id")
      .eq("is_read", true)
      .eq("is_deleted", false);

    if (readError || !readMessages || readMessages.length === 0) {
      if (readError) logger.error("Error finding read messages:", readError);
      return 0;
    }

    // Group messages by sender for efficient privacy settings lookup
    const messagesBySender: Record<string, string[]> = {};
    readMessages.forEach((msg) => {
      if (!messagesBySender[msg.sender_id]) {
        messagesBySender[msg.sender_id] = [];
      }
      messagesBySender[msg.sender_id].push(msg.id);
    });

    // Process each sender's messages
    let totalDeleted = 0;

    for (const [senderId, messageIds] of Object.entries(messagesBySender)) {
      // Get sender's privacy settings
      const { data: privacyData, error: privacyError } = await supabaseAdmin!
        .from("user_privacy_settings")
        .select("settings")
        .eq("user_id", senderId)
        .single();

      if (privacyError) {
        logger.error(
          `Error getting privacy settings for user ${senderId}:`,
          privacyError,
        );
        continue;
      }

      // Check if sender uses AFTER_READ retention policy
      const retentionPeriod =
        privacyData?.settings?.messageSettings?.messageRetentionPeriod;

      if (retentionPeriod === MessageRetentionPeriod.AFTER_READ) {
        // Delete these messages
        const { data, error } = await supabaseAdmin!
          .from("messages")
          .update({
            is_deleted: true,
            content:
              "[This message was automatically deleted after being read]",
            media: [],
          })
          .in("id", messageIds);

        if (error) {
          logger.error(
            `Error deleting read messages for sender ${senderId}:`,
            error,
          );
        } else {
          totalDeleted += (data as unknown as unknown[]).length || 0;
        }
      }
    }

    return totalDeleted;
  } catch (error) {
    logger.error("Error in cleanupReadMessages:", error);
    return 0;
  }
}
