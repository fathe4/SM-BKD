import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { RankingService } from "../services/simulation/ranking.service";
import { EtiquetteService } from "../services/simulation/etiquette.service";
import { SimulationEngine } from "../services/simulation/simulationEngine";

async function main() {
  logger.info("--- Starting Local-Only Simulation Run (No Network) ---");
  
  try {
    // 1. Ranking
    logger.info("1. Running Ranking phase...");
    await RankingService.refreshFeedCaches();

    // 2. Increment global clock
    logger.info("2. Incrementing clock...");
    const { data: clockState } = await supabaseAdmin!
      .from("simulation_state")
      .select("*")
      .single();

    if (clockState) {
      const nextTick = clockState.current_tick + 1;
      await supabaseAdmin!
        .from("simulation_state")
        .update({
          current_tick: nextTick,
          updated_at: new Date().toISOString()
        })
        .eq("id", clockState.id);
      logger.info(`Clock advanced to tick ${nextTick}`);
    }

    // 3. Attention Scroll checks
    logger.info("3. Running Attention & Etiquette phase...");
    const { data: personas } = await supabaseAdmin!
      .from("persona_identities")
      .select("id, username");

    if (personas) {
      for (const persona of personas) {
        // Fetch top unseen feed item
        const { data: feedItem } = await supabaseAdmin!
          .from("feed_items")
          .select("*, feed_candidates(*)")
          .eq("persona_id", persona.id)
          .eq("seen", false)
          .order("score", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (feedItem && feedItem.feed_candidates) {
          const candidate = feedItem.feed_candidates;
          logger.info(`Evaluating candidate for @${persona.username}: "${candidate.title.slice(0, 50)}" with score ${feedItem.score}`);
          await EtiquetteService.evaluateEngagement(persona.id, candidate);
        } else {
          logger.info(`No unseen feed items found for @${persona.username}`);
        }
      }
    }

    // 4. Force queue jobs to run immediately (update pending run_at times to past so they process)
    logger.info("4. Fast-forwarding scheduled behavior jobs to run now...");
    await supabaseAdmin!
      .from("behavior_jobs")
      .update({ run_at: new Date(Date.now() - 1000).toISOString() })
      .eq("status", "pending");

    // 5. Process behavior jobs
    logger.info("5. Processing behavior queue...");
    await SimulationEngine.processBehaviorQueue();

  } catch (err: any) {
    logger.error("Local simulation error:", err);
  }
}

main().then(() => {
  logger.info("Local-only tick complete!");
  process.exit(0);
});
