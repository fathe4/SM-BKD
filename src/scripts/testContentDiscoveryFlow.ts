import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ContentEngineService } from "../services/simulation/contentEngine.service";

async function main() {
  logger.info("--- Starting Content Discovery Flow Test ---");

  // Fetch a standard AI persona (not the guru accounts)
  const { data: persona } = await supabaseAdmin!
    .from("persona_identities")
    .select("id, username, user_id, timezone")
    .not("username", "in", '("tech_guru_ai","marketing_guru_ai","design_guru_ai")')
    .limit(1)
    .single();

  if (!persona) {
    logger.error("Could not find any standard AI personas.");
    process.exit(1);
  }

  logger.info(`Found standard persona: @${persona.username}`);

  // Fetch their profile/category to log context
  const { data: aiPersona } = await supabaseAdmin!
    .from("ai_personas")
    .select("category")
    .eq("user_id", persona.user_id)
    .maybeSingle();

  logger.info(`Persona category: "${aiPersona?.category || 'General'}"`);

  logger.info(`Generating and publishing post using the Discovery Pipeline integration...`);
  await ContentEngineService.generateAndPublishPost(persona.id, "standard");

  logger.info("--- Content Discovery Flow Test Complete ---");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Test execution failed:", err);
    process.exit(1);
  });
