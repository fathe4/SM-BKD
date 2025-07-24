import { CronJob } from "cron";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../config/supabase";
import { BoostStatus } from "../models/boost.model";

/**
 * Job to automatically expire active boosts that have passed their expiration time
 */
export function setupBoostExpirationJob(): void {
  // Run every hour to check for expired boosts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const job = new CronJob(
    "0 * * * *", // Every hour at minute 0
    async () => {
      try {
        logger.info("Starting boost expiration job");

        if (!supabaseAdmin) {
          logger.error(
            "Supabase admin client is not configured. Skipping boost expiration job."
          );
          return;
        }

        // Update all active boosts that have expired
        const { data: expiredBoosts, error } = await supabaseAdmin
          .from("post_boosts")
          .update({
            status: BoostStatus.EXPIRED,
            updated_at: new Date().toISOString(),
          })
          .eq("status", BoostStatus.ACTIVE)
          .lt("expires_at", new Date().toISOString())
          .select("id, post_id, expires_at");

        if (error) {
          logger.error("Error expiring boosts:", error);
          return;
        }

        if (expiredBoosts && expiredBoosts.length > 0) {
          logger.info(`Expired ${expiredBoosts.length} boost(s):`, {
            expiredBoosts: expiredBoosts.map((boost) => ({
              id: boost.id,
              post_id: boost.post_id,
              expires_at: boost.expires_at,
            })),
          });
        } else {
          logger.info("No boosts to expire at this time");
        }
      } catch (error) {
        logger.error("Boost expiration job failed:", error);
      }
    },
    null, // onComplete callback
    true, // start immediately
    "UTC" // timezone
  );

  logger.info("Boost expiration job scheduled to run every hour");
}
