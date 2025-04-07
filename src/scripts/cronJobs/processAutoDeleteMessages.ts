// src/scripts/cronJobs/processAutoDeleteMessages.ts
import cron from "node-cron";
import { logger } from "../../utils/logger";
import { ChatService } from "../../services/chatService";

/**
 * Scheduled task to process auto-delete messages
 * This runs every 15 minutes and processes messages in batches
 */
export function scheduleAutoDeleteCron() {
  // Run every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    logger.info("Running auto-delete messages cron job");

    let totalProcessed = 0;
    let batchProcessed = 0;
    const batchSize = 100; // Process 100 messages at a time
    const maxBatches = 10; // Max 10 batches per run to prevent overload

    try {
      // Process messages in batches
      let batches = 0;
      do {
        batchProcessed = await ChatService.processAutoDeleteMessages(batchSize);
        totalProcessed += batchProcessed;
        batches++;

        // If batch was full, there might be more messages to process
        // But limit the number of batches per run to avoid overloading
        if (batchProcessed < batchSize || batches >= maxBatches) {
          break;
        }

        // Small delay between batches to reduce database load
        await new Promise((resolve) => setTimeout(resolve, 500));
      } while (batchProcessed > 0);

      logger.info(
        `Auto-delete cron job completed. Processed ${totalProcessed} messages in ${batches} batches.`
      );
    } catch (error) {
      logger.error("Error in auto-delete cron job:", error);
    }
  });

  logger.info("Auto-delete messages cron job scheduled");
}

// If this file is run directly, start the cron job
if (require.main === module) {
  scheduleAutoDeleteCron();
}
