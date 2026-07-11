import { supabaseAdmin } from "../config/supabase";
import { LlmRendererService } from "../services/simulation/llmRenderer.service";
import { Intent } from "../models/ai-persona.model";

async function main() {
  console.log("Testing Grounded Visual Comment Generation...");

  // Get our image post candidate
  const candidateId = "a3b9beca-31e2-4045-b6da-5dad13fb7c04";
  const { data: candidate } = await supabaseAdmin!
    .from("feed_candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    console.error("Candidate not found.");
    return;
  }

  // Get some persona identities
  const { data: personas } = await supabaseAdmin!
    .from("persona_identities")
    .select("*")
    .limit(3);

  if (!personas || personas.length === 0) {
    console.error("No personas found.");
    return;
  }

  const postContent = candidate.summary || "";
  const imageUrl = candidate.imageurl || null;

  console.log(`Post Details:`);
  console.log(`- Title: "${candidate.title}"`);
  console.log(`- Image URL: "${imageUrl}"`);
  console.log(`\nGenerating comments for 3 personas...`);

  for (const persona of personas) {
    const intent: Intent = {
      actorId: persona.id,
      action: "COMMENT",
      targetType: "post",
      targetId: candidateId,
      subjectEntityName: "General Discussion",
      stance: 0.5,
      internalThought: {
        triggeredMemories: [],
        dominantGoal: `React authentically to the post: ${postContent.slice(0, 100)}...`,
        dominantEmotion: { valence: 0.5, arousal: 0.5 }
      },
      tone: {
        sarcasm: 0.1,
        optimism: 0.7,
        certainty: 0.8,
        warmth: 0.6
      },
      length: "short",
      writingStyle: {}
    };

    const { data: existingComments } = await supabaseAdmin!
      .from("comments")
      .select("content")
      .eq("post_id", candidateId)
      .order("created_at", { ascending: true })
      .limit(10);
    const previousComments = (existingComments || []).map((c: any) => c.content);

    const comment = await LlmRendererService.renderContent(persona, intent, postContent, imageUrl, previousComments);
    console.log(`\n@${persona.username} (${persona.profession}):`);
    console.log(`"${comment}"`);
  }
}

main().then(() => process.exit(0));
