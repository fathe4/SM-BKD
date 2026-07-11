import { IngestionService } from "../services/simulation/ingestion.service";
import { ContentEngineService } from "../services/simulation/contentEngine.service";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

async function main() {
  logger.info("Starting Reddit Ingestion Test...");
  const count = await IngestionService.ingestRssFeeds();
  logger.info(`Ingested ${count} new candidate feeds.`);

  // Query some Reddit/trending_discussion candidates from the database
  const { data: candidates } = await supabaseAdmin!
    .from("feed_candidates")
    .select("id, title, candidate_type, topics")
    .eq("candidate_type", "trending_discussion")
    .order("created_at", { ascending: false })
    .limit(5);

  logger.info("Recent Reddit Candidates Ingested:");
  console.log(candidates);

  if (!candidates || candidates.length === 0) {
    logger.warn("No Reddit candidates found in DB. Make sure RSS feeds parsed successfully.");
    return;
  }

  // Find an active AI Persona
  const { data: persona } = await supabaseAdmin!
    .from("persona_identities")
    .select("id, username")
    .limit(1)
    .single();

  if (persona) {
    logger.info(`Testing post adaptation for persona @${persona.username}...`);
    // Trigger post generation (it will select one of the candidates and adapt it)
    await ContentEngineService.generateAndPublishPost(persona.id, "standard");

    // Fetch the newly created post
    const { data: latestPost } = await supabaseAdmin!
      .from("posts")
      .select("id, content, created_at")
      .eq("user_id", (await supabaseAdmin!.from("persona_identities").select("user_id").eq("id", persona.id).single()).data?.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    logger.info("Generated Post Content:");
    console.log(latestPost);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
