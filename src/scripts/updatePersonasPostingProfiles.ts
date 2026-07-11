import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { config } from "dotenv";

config();

async function main() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  logger.info("Updating existing personas with human-like posting profiles...");

  // Fetch persona identities
  const { data: personas, error } = await supabaseAdmin
    .from("persona_identities")
    .select("id, username, user_id");

  if (error || !personas) {
    logger.error("Failed to fetch personas:", error);
    process.exit(1);
  }

  logger.info(`Found ${personas.length} personas to update.`);

  let updatedCount = 0;

  for (const persona of personas) {
    // Fetch their AI Persona category
    const { data: aiPersona } = await supabaseAdmin
      .from("ai_personas")
      .select("category")
      .eq("user_id", persona.user_id)
      .maybeSingle();

    const category = aiPersona?.category || "Technology & AI Future";

    // Roll profile name
    const postingProfileName = Math.random() < 0.10 
      ? "lurker" 
      : Math.random() < 0.05 
        ? "influencer" 
        : category.includes("Technology") 
          ? "engineer" 
          : category.includes("Design") 
            ? "designer" 
            : "marketer";

    // Update persona_conversation_profiles
    const { error: updateErr } = await supabaseAdmin
      .from("persona_conversation_profiles")
      .update({ posting_profile_name: postingProfileName })
      .eq("persona_id", persona.id);

    if (updateErr) {
      logger.error(`Failed to update persona ${persona.username}:`, updateErr);
    } else {
      updatedCount++;
    }
  }

  logger.info(`Successfully updated ${updatedCount}/${personas.length} personas.`);
}

main().then(() => process.exit(0)).catch(err => {
  logger.error("Global script error:", err);
  process.exit(1);
});
