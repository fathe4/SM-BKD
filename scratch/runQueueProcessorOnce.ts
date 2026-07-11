import http from "http";
import { initializeSocketIO } from "../src/socketio";
initializeSocketIO(http.createServer());

import { SimulationEngine } from "../src/services/simulation/simulationEngine";
import { logger } from "../src/utils/logger";

async function main() {
  logger.info("Starting a single queue processing cycle...");
  try {
    await SimulationEngine.processBehaviorQueue();
    logger.info("Queue processing cycle complete!");
  } catch (err: any) {
    logger.error(`Error processing queue: ${err.message}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
