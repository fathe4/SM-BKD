import { supabaseAdmin } from "../config/supabase";

async function run() {
  const postId = "5a008961-977e-49be-9132-126aac3f5ea1";
  console.log(`Testing manual candidate ingestion for post ${postId}...`);

  const { data: post } = await supabaseAdmin!
    .from("posts")
    .select("id, user_id, content, created_at, users(username, is_ai)")
    .eq("id", postId)
    .single();

  if (!post) {
    console.error("Post not found");
    return;
  }

  const user = post.users as any;
  const origin = user?.is_ai ? "AI" : "HUMAN";
  const title = post.content ? post.content.slice(0, 80) + "..." : "New Post";

  const { data: newCandidate, error } = await supabaseAdmin!
    .from("feed_candidates")
    .insert({
      candidate_type: "user_post",
      origin: origin,
      reference_id: post.id,
      title: title,
      summary: post.content || "",
      source: user?.username || "unknown",
      importance: origin === "HUMAN" ? 0.8 : 0.5,
      topics: ["general"],
      published_at: post.created_at,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("Postgres Insertion Error:", error);
  } else {
    console.log("Postgres Insertion Success:", newCandidate);
  }
}

run().then(() => process.exit(0));
