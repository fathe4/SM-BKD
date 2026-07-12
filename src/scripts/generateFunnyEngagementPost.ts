import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ContentEngineService } from "../services/simulation/contentEngine.service";
import { ScraperService } from "../services/simulation/scraper.service";
import { REDDIT_SUBREDDITS } from "../config/redditSimulationConfig";

async function main() {
  console.log("\n========================================================");
  console.log("🔥 AI Persona Funny Engagement Post Generator 🔥");
  console.log("========================================================\n");

  // 1. Resolve Persona
  const argUsername = process.argv[2];
  let persona: any = null;

  if (argUsername) {
    const cleanUsername = argUsername.replace(/^@/, "").trim();
    console.log(`Searching for persona with username: @${cleanUsername}...`);
    const { data } = await supabaseAdmin!
      .from("persona_identities")
      .select("*, persona_conversation_profiles(posting_profile_name)")
      .eq("username", cleanUsername)
      .maybeSingle();
    
    if (!data) {
      console.error(`❌ Error: Persona with username @${cleanUsername} not found.`);
      process.exit(1);
    }
    persona = data;
  } else {
    console.log("No username specified. Selecting the most humorous active persona...");
    // 1. Fetch active user_ids from ai_personas
    const { data: activeList } = await supabaseAdmin!
      .from("ai_personas")
      .select("user_id")
      .eq("is_active", true);

    const activeUserIds = activeList?.map(p => p.user_id) || [];

    // 2. Query persona_identities for these active users
    const { data } = await supabaseAdmin!
      .from("persona_identities")
      .select("*, persona_conversation_profiles(posting_profile_name)")
      .in("user_id", activeUserIds)
      .order("humor", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      console.log("⚠️ No active personas found in ai_personas. Trying any available persona...");
      const { data: fallback } = await supabaseAdmin!
        .from("persona_identities")
        .select("*, persona_conversation_profiles(posting_profile_name)")
        .limit(1)
        .maybeSingle();
      
      if (!fallback) {
        console.error("❌ Error: No personas found in the database. Please seed identities first.");
        process.exit(1);
      }
      persona = fallback;
    } else {
      persona = data;
    }
  }

  console.log(`👉 Selected Persona: @${persona.username} (Humor Score: ${persona.humor || 0.5})`);

  // 2. Reset persona's energy & daily post count to bypass limits
  console.log("🔄 Resetting persona daily posting budget and energy...");
  await supabaseAdmin!
    .from("persona_states")
    .update({
      today_post_count: 0,
      today_post_budget: 5,
      energy: 1.0
    })
    .eq("persona_id", persona.id);

  // 3. Scraping fresh content
  console.log("🌐 Running Playwright Reddit Scraper to gather fresh content with images...");
  const scrapedCount = await ScraperService.runScraperPipeline(REDDIT_SUBREDDITS);
  console.log(`✅ Scraped and ingested ${scrapedCount} new topics into feed_candidates.`);

  // 4. Force post generation of type funnyObservation
  const profileName = (persona.persona_conversation_profiles as any)?.posting_profile_name || "standard";
  console.log(`🤖 Triggering content engine to generate "funnyObservation" post for @${persona.username}...`);
  
  await ContentEngineService.generateAndPublishPost(persona.id, profileName, "funnyObservation");

  // 5. Fetch and print the generated post
  console.log("\n========================================================");
  console.log("📥 FETCHING NEWLY GENERATED POST");
  console.log("========================================================\n");

  const { data: post } = await supabaseAdmin!
    .from("posts")
    .select("id, content, created_at, users(username), post_media(media_url)")
    .eq("user_id", persona.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (post) {
    console.log(`✍️  Author: @${(post.users as any)?.username}`);
    console.log(`📅 Created At: ${post.created_at}`);
    console.log(`💬 Content:\n--------------------------------------------------------`);
    console.log(post.content);
    console.log(`--------------------------------------------------------`);
    if (post.post_media && (post.post_media as any[]).length > 0) {
      console.log("🖼️  Attached Image URL:");
      (post.post_media as any[]).forEach((m, idx) => {
        console.log(`   [${idx + 1}] ${m.media_url}`);
      });
    } else {
      console.log("🖼️  No attached media.");
    }
  } else {
    console.log("❌ Error: No new post found. It is possible the persona chose to 'IGNORE' all candidates.");
  }
  console.log("\n========================================================\n");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("❌ Execution failed:", err);
  process.exit(1);
});
