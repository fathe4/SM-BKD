import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../config/supabase";
import { config } from "dotenv";
import { logger } from "../utils/logger";

config();

/**
 * Setup database schema by running SQL migrations
 */
async function setupDatabase() {
  if (!supabaseAdmin) {
    logger.error(
      "Supabase admin client not initialized. Check your environment variables.",
    );
    process.exit(1);
  }

  try {
    logger.info("Starting database setup...");

    // Read the schema SQL file
    const schemaPath = path.join(__dirname, "db-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    // Split the SQL into individual statements
    const statements = schemaSql
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      logger.info(`Executing statement ${i + 1}/${statements.length}`);

      const { error } = await supabaseAdmin.rpc("execute_sql", {
        sql_query: statement + ";",
      });

      if (error) {
        logger.error(`Error executing statement ${i + 1}:`, error);
        throw error;
      }
    }

    logger.info("Database setup completed successfully!");
  } catch (error) {
    logger.error("Error setting up database:", error);
    process.exit(1);
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  setupDatabase().catch((error) => {
    logger.error("Database setup failed:", error);
    process.exit(1);
  });
}

export default setupDatabase;
