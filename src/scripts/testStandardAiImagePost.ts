import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ContentEngineService } from "../services/simulation/contentEngine.service";
import { PostService } from "../services/postService";
import { PostVisibility } from "../models/post.model";
import { LlmRendererService } from "../services/simulation/llmRenderer.service";
import { UUID } from "crypto";

async function main() {
  logger.info("--- Starting Standard AI 3rd-Party Image Post Test ---");

  // Fetch a standard AI persona (not the guru accounts)
  const { data: persona } = await supabaseAdmin!
    .from("persona_identities")
    .select("id, username, user_id, writing_style")
    .not("username", "in", '("tech_guru_ai","marketing_guru_ai","design_guru_ai")')
    .limit(1)
    .single();

  if (!persona) {
    logger.error("Could not find any standard AI personas.");
    process.exit(1);
  }

  logger.info(`Found standard persona: @${persona.username}`);

  // Fetch a 3rd party candidate (NEWS or SYSTEM) that has an image
  const { data: candidate } = await supabaseAdmin!
    .from("feed_candidates")
    .select("*")
    .in("candidate_type", ["news", "trending_discussion"])
    .not("imageurl", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!candidate) {
    logger.error("❌ FAILED: No 3rd-party candidate with an image found in the database. Run ingestion first.");
    process.exit(1);
  }

  logger.info(`Forcing 3rd-party candidate: "${candidate.title}"`);
  logger.info(`Candidate Image URL: ${candidate.imageurl}`);

  const postType = "newsOpinion";
  const intent = {
    actorId: persona.id,
    action: "POST" as const,
    subjectEntityName: "Technology & AI Future",
    stance: 0.5,
    internalThought: {
      triggeredMemories: [],
      dominantGoal: `Share a fresh post of type: ${postType}`,
      dominantEmotion: { valence: 0.7, arousal: 0.6 }
    },
    tone: { sarcasm: 0.05, optimism: 0.8, certainty: 0.85, warmth: 0.7 },
    length: "short" as const,
    writingStyle: {
      capitalization: persona.writing_style?.capitalization || "standard",
      slangUsage: persona.writing_style?.slangUsage || false,
      technicalDepth: persona.writing_style?.technicalDepth || 0.6
    }
  };

  const sourceContext = `Source Content (Type: ${candidate.candidate_type}):\nTitle: "${candidate.title}"\nDetails: "${candidate.summary}"`;
  const newsImageUrl = candidate.imageurl;

  logger.info("Generating post content via LLM...");
  const contentObj = await LlmRendererService.renderContent(
    persona,
    intent,
    sourceContext,
    newsImageUrl,
    undefined,
    postType
  );

  const content = contentObj?.content;

  if (!content) {
    logger.error("❌ FAILED: LLM content generation failed.");
    process.exit(1);
  }

  logger.info(`Generated content: "${content.slice(0, 100)}..."`);

  // Create post
  const createdPost = await PostService.createPost({
    user_id: persona.user_id as UUID,
    content,
    visibility: PostVisibility.PUBLIC,
    is_ai_generated: true,
    source: candidate.title
  });

  if (createdPost && newsImageUrl) {
    logger.info("Attaching 3rd-party media to post...");
    await PostService.addPostMedia([{
      post_id: createdPost.id as UUID,
      media_url: newsImageUrl,
      media_type: "image" as any,
      order: 0
    }]);

    // Invalidate caches AFTER media has been added
    logger.info("Invalidating relevant feed caches...");
    await PostService.invalidateRelevantFeeds(persona.user_id, createdPost.location);

    // Verify it is in database
    const { data: media } = await supabaseAdmin!
      .from("post_media")
      .select("*")
      .eq("post_id", createdPost.id);

    if (media && media.length > 0) {
      logger.info(`✅ SUCCESS! Post successfully created with 3rd-party media:`);
      media.forEach(m => console.log(`   - URL: ${m.media_url}`));
    } else {
      logger.error("❌ FAILED: Post created but media was not saved in DB.");
    }
  } else {
    logger.error("❌ FAILED: Post creation failed or image URL is missing.");
  }

  logger.info("--- Test Complete ---");
}

main().then(() => process.exit(0)).catch(err => {
  logger.error("Test execution failed:", err);
  process.exit(1);
});
