// src/scripts/triggerSimulationCycle.ts
import http from "http";
import { initializeSocketIO } from "../src/socketio";
initializeSocketIO(http.createServer());

import { SimulationEngine } from "../src/services/simulation/simulationEngine";
import { logger } from "../src/utils/logger";
import { supabaseAdmin } from "../src/config/supabase";

async function main() {
  logger.info("Triggering a single simulation cycle tick...");
  try {
    await SimulationEngine.runSimulationCycle();
    logger.info("Simulation cycle execution complete!");

    // Now, query what POST jobs got scheduled
    const { data: jobs, error } = await supabaseAdmin!
      .from("behavior_jobs")
      .select("id, persona_id, action_type, run_at, status, persona_identities(username)")
      .eq("status", "pending")
      .eq("action_type", "POST")
      .order("run_at", { ascending: true });

    if (error) {
      logger.error(`Failed to fetch pending posts: ${error.message}`);
      return;
    }

    if (!jobs || jobs.length === 0) {
      logger.warn("No new POST jobs were scheduled in this cycle. This is likely because all active personas are currently on their 2-hour post cooldown or did not pass their random posting hourly chance.");
    } else {
      logger.info(`Successfully scheduled ${jobs.length} new POST jobs:`);
      jobs.forEach((job: any, index: number) => {
        const username = job.persona_identities?.username || "unknown";
        logger.info(`[${index + 1}] @${username} scheduled to post at ${job.run_at}`);
      });
    }

  } catch (err: any) {
    logger.error(`Failed to run simulation cycle: ${err.message}`);
  }
}

main()
  .then(() => {
    logger.info("Finished execution.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Fatal execution error: ${err.message}`);
    process.exit(1);
  });
