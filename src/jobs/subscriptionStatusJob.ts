import { CronJob } from "cron";
import { logger } from "../utils/logger";
import { supabase } from "../config/supabase";

/**
 * Job to automatically update user subscription status based on expiration dates
 * Runs every hour to check for expired subscriptions
 */
export function setupSubscriptionStatusJob(): void {
  // Run every hour to check for expired subscriptions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const job = new CronJob(
    "0 * * * *", // Every hour at minute 0
    async () => {
      try {
        logger.info("Starting subscription status job");

        if (!supabase) {
          logger.error(
            "Supabase admin client is not configured. Skipping subscription status job.",
          );
          return;
        }

        const currentTime = new Date().toISOString();
        logger.info(`Checking subscriptions as of: ${currentTime}`);

        // Update active subscriptions that have expired
        const { data: expiredSubscriptions, error: expiredError } = await supabase
          .from("user_subscriptions")
          .update({
            status: "expired",
            updated_at: currentTime,
          })
          .eq("status", "active")
          .lt("expires_at", currentTime)
          .select("id, user_id, expires_at, subscription_tier_id");

        if (expiredError) {
          logger.error("Error expiring subscriptions:", expiredError);
          return;
        }

        // Update past_due subscriptions that have expired
        const { data: pastDueExpired, error: pastDueError } = await supabase
          .from("user_subscriptions")
          .update({
            status: "expired",
            updated_at: currentTime,
          })
          .eq("status", "past_due")
          .lt("expires_at", currentTime)
          .select("id, user_id, expires_at, subscription_tier_id");

        if (pastDueError) {
          logger.error("Error expiring past_due subscriptions:", pastDueError);
          return;
        }

        // Update pending subscriptions that have expired
        const { data: pendingExpired, error: pendingError } = await supabase
          .from("user_subscriptions")
          .update({
            status: "expired",
            updated_at: currentTime,
          })
          .eq("status", "pending")
          .lt("expires_at", currentTime)
          .select("id, user_id, expires_at, subscription_tier_id");

        if (pendingError) {
          logger.error("Error expiring pending subscriptions:", pendingError);
          return;
        }

        // Log results
        const totalExpired = (expiredSubscriptions?.length || 0) + 
                           (pastDueExpired?.length || 0) + 
                           (pendingExpired?.length || 0);

        if (totalExpired > 0) {
          logger.info(`Expired ${totalExpired} subscription(s):`, {
            activeExpired: expiredSubscriptions?.length || 0,
            pastDueExpired: pastDueExpired?.length || 0,
            pendingExpired: pendingExpired?.length || 0,
            expiredSubscriptions: [
              ...(expiredSubscriptions || []),
              ...(pastDueExpired || []),
              ...(pendingExpired || [])
            ].map((sub) => ({
              id: sub.id,
              user_id: sub.user_id,
              expires_at: sub.expires_at,
              subscription_tier_id: sub.subscription_tier_id,
            })),
          });

          // Log individual subscription details for better tracking
          if (expiredSubscriptions && expiredSubscriptions.length > 0) {
            logger.info(`Active subscriptions expired: ${expiredSubscriptions.length}`);
            expiredSubscriptions.forEach(sub => {
              logger.info(`- User ${sub.user_id}: Subscription ${sub.id} expired at ${sub.expires_at}`);
            });
          }

          if (pastDueExpired && pastDueExpired.length > 0) {
            logger.info(`Past due subscriptions expired: ${pastDueExpired.length}`);
            pastDueExpired.forEach(sub => {
              logger.info(`- User ${sub.user_id}: Subscription ${sub.id} expired at ${sub.expires_at}`);
            });
          }

          if (pendingExpired && pendingExpired.length > 0) {
            logger.info(`Pending subscriptions expired: ${pendingExpired.length}`);
            pendingExpired.forEach(sub => {
              logger.info(`- User ${sub.user_id}: Subscription ${sub.id} expired at ${sub.expires_at}`);
            });
          }
        } else {
          logger.info("No subscriptions to expire at this time");
        }

        // Optional: Check for subscriptions that are about to expire (within 24 hours)
        const warningTime = new Date();
        warningTime.setHours(warningTime.getHours() + 24);
        const warningTimeISO = warningTime.toISOString();

        const { data: expiringSoon, error: warningError } = await supabase
          .from("user_subscriptions")
          .select("id, user_id, expires_at, subscription_tier_id")
          .eq("status", "active")
          .gte("expires_at", currentTime)
          .lte("expires_at", warningTimeISO);

        if (warningError) {
          logger.error("Error checking expiring subscriptions:", warningError);
        } else if (expiringSoon && expiringSoon.length > 0) {
          logger.warn(`Found ${expiringSoon.length} subscription(s) expiring within 24 hours:`, {
            expiringSoon: expiringSoon.map(sub => ({
              id: sub.id,
              user_id: sub.user_id,
              expires_at: sub.expires_at,
              subscription_tier_id: sub.subscription_tier_id,
            }))
          });
        }

      } catch (error) {
        logger.error("Subscription status job failed:", error);
      }
    },
    null, // onComplete callback
    true, // start immediately
    "UTC", // timezone
  );

  logger.info("Subscription status job scheduled to run every hour");
}
