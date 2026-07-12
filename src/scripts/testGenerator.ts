import { config } from "dotenv";
import { runGenerator, runQueueProcessor } from "../jobs/aiEngagementJob";
import { logger } from "../utils/logger";

config();

async function main() {
  logger.info("--- Starting AI Post Generation Run (RSS & Cloudinary) ---");
  
  // Temporarily bypass the posting frequency limit for testing
  // to force the generation to run.
  try {
    await runGenerator();
    logger.info("Post generation cycle complete. Waiting 5 seconds before processing queue...");
    
    // Wait for jobs to get inserted
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    logger.info("--- Running Queue Processor ---");
    await runQueueProcessor();
    logger.info("Queue processor cycle complete!");
  } catch (e: any) {
    logger.error("Test execution failed:", e);
  }
}

main().then(() => {
  logger.info("Test execution finished successfully.");
  process.exit(0);
});
