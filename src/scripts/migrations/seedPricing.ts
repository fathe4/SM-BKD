import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../../config/supabase";
import { config } from "dotenv";
import { logger } from "../../utils/logger";

config();

/**
 * Seed pricing data: boost pricing tiers, marketplace subscription
 * tiers, marketplace categories, free-tier subscriptions for existing
 * users, and the auto-subscribe trigger for new signups.
 *
 * The SQL file separates statements with the "-- !split" marker
 * (not ";") because trigger/function bodies contain semicolons.
 * Safe to run multiple times (idempotent inserts).
 */
async function seedPricing() {
  if (!supabaseAdmin) {
    logger.error(
      "Supabase admin client not initialized. Check your environment variables.",
    );
    process.exit(1);
  }

  try {
    logger.info("Seeding pricing data...");

    const sqlPath = path.join(__dirname, "seed-pricing.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    const statements = sql
      .split("-- !split")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (let i = 0; i < statements.length; i++) {
      logger.info(`Executing statement ${i + 1}/${statements.length}`);
      const { error } = await supabaseAdmin.rpc("execute_sql", {
        sql_query: statements[i] + ";",
      });

      if (error) {
        logger.error(`Error executing statement ${i + 1}:`, error);
        throw error;
      }
    }

    logger.info("Pricing seed completed successfully!");
  } catch (error) {
    logger.error("Error seeding pricing data:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedPricing().catch((error) => {
    logger.error("Pricing seed failed:", error);
    process.exit(1);
  });
}
