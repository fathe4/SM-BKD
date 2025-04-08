import { CronJob } from "cron";
import { messageService } from "../services/messageService";
import { logger } from "../utils/logger";

/**
 * Job to clean up expired messages based on retention policies
 */
export function setupMessageRetentionJob(): void {
  // Run daily at 3 AM
  const job = new CronJob("0 3 * * *", async () => {
    try {
      logger.info("Starting message retention job");

      // Clean up messages that have reached their expiration time
      const expiredCount = await messageService.cleanupExpiredMessages();
      logger.info(`Cleaned up ${expiredCount} expired messages`);

      // Clean up read messages with "after_read" retention policy
      const readMsgCount = await messageService.cleanupReadMessages();
      logger.info(
        `Cleaned up ${readMsgCount} read messages with after_read policy`
      );
    } catch (error) {
      logger.error("Error in message retention job:", error);
    }
  });

  // Start the job
  job.start();
  logger.info("Message retention job scheduled");
}
