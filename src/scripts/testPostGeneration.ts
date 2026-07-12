import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ContentEngineService } from "../services/simulation/contentEngine.service";

async function main() {
  logger.info("--- Starting Force Post Generation Test ---");

  // Fetch a tech/design persona
  const { data: persona } = await supabaseAdmin!
    .from("persona_identities")
    .select("id, username, persona_conversation_profiles(posting_profile_name)")
    .or("username.eq.tech_guru_ai,username.eq.design_guru_ai,username.eq.marketing_guru_ai")
    .limit(1)
    .single();

  if (!persona) {
    logger.error("Could not find tech_guru_ai, design_guru_ai, or marketing_guru_ai.");
    process.exit(1);
  }

  const profileName = (persona.persona_conversation_profiles as any)?.posting_profile_name || "standard";
  logger.info(`Found persona: @${persona.username} with profile: ${profileName}`);

  logger.info("Generating and publishing newsOpinion post...");
  await ContentEngineService.generateAndPublishPost(persona.id, profileName, "newsOpinion");

  logger.info("Generating and publishing funnyObservation post...");
  await ContentEngineService.generateAndPublishPost(persona.id, profileName, "funnyObservation");

  logger.info("--- Force Post Generation Test Complete ---");
}

main().then(() => process.exit(0)).catch(err => {
  logger.error("Test execution failed:", err);
  process.exit(1);
});
