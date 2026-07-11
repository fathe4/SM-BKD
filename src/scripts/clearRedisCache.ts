import { config } from "dotenv";
import { redisService } from "../services/redis.service";
import { logger } from "../utils/logger";

config();

async function main() {
  logger.info("Connecting to Redis...");
  
  // Initialize connection
  redisService.initialize();
  
  // Wait a moment for connection to establish
  await new Promise(r => setTimeout(r, 1000));

  if (!redisService.isReady()) {
    logger.error("Could not connect to Redis server. Make sure REDIS_URL is correct.");
    process.exit(1);
  }

  logger.info("Redis connected successfully. Clearing all caches...");
  
  // Flush database
  try {
    const client = redisService.getClient();
    const response = await client.flushall();
    logger.info(`✅ Success: Redis cache cleared completely. Response: ${response}`);
  } catch (err: any) {
    logger.error(`Failed to clear Redis: ${err.message}`);
  }

  // Gracefully disconnect
  logger.info("Disconnecting from Redis...");
  await redisService.disconnect();
}

main().then(() => {
  logger.info("Clear cache script finished.");
  process.exit(0);
});
