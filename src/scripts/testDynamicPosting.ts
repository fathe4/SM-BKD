import { SimulationEngine } from "../services/simulation/simulationEngine";
import { logger } from "../utils/logger";

async function main() {
  logger.info("--- Starting Real Simulation Cycle Test ---");
  await SimulationEngine.runSimulationCycle();
  logger.info("--- Real Simulation Cycle Test Done ---");
}

main().then(() => process.exit(0)).catch(err => {
  logger.error("Test execution failed:", err);
  process.exit(1);
});
