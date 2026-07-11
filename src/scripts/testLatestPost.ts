import { supabaseAdmin } from "../config/supabase";

async function checkLatestPost() {
  console.log("Checking latest post in posts table...");
  const { data: posts, error } = await supabaseAdmin!
    .from("posts")
    .select("id, content, created_at, is_ai_generated")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !posts) {
    console.error("Error:", error);
    return;
  }

  console.log("Latest Posts:");
  console.log(JSON.stringify(posts, null, 2));

  for (const post of posts) {
    const { data: candidate } = await supabaseAdmin!
      .from("feed_candidates")
      .select("id, title, origin, importance, topics")
      .eq("reference_id", post.id)
      .maybeSingle();

    if (candidate) {
      console.log(`\nMatched Candidate for post ${post.id}:`);
      console.log(candidate);

      const { data: feedItems } = await supabaseAdmin!
        .from("feed_items")
        .select("persona_id, score, reason, seen")
        .eq("feed_candidate_id", candidate.id);

      console.log("Feed Cache Items for this candidate:");
      console.log(feedItems);
    }
  }
}

checkLatestPost().then(() => process.exit(0));
