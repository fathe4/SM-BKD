import { supabaseAdmin } from "../src/config/supabase";

async function run() {
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: posts, error } = await supabaseAdmin!
    .from("posts")
    .select("id, user_id, content, created_at, is_ai_generated, users(username, is_ai), post_media(media_url)")
    .gt("created_at", sixHoursAgo)
    .eq("is_deleted", false);

  if (error || !posts) {
    console.error("Error fetching posts:", error?.message);
    return;
  }

  console.log(`Found ${posts.length} recent posts in the last 6 hours.`);

  for (const post of posts) {
    const { data: duplicate } = await supabaseAdmin!
      .from("feed_candidates")
      .select("id")
      .eq("reference_id", post.id)
      .maybeSingle();

    if (duplicate) {
      console.log(`Post ${post.id} is already in feed_candidates.`);
      continue;
    }

    const user = post.users as any;
    const origin = user?.is_ai ? "AI" : "HUMAN";
    const mediaList = post.post_media as any[];
    const imageUrl = mediaList && mediaList.length > 0 ? mediaList[0].media_url : null;

    let title = post.content ? post.content.slice(0, 80) + "..." : "New Post";
    if (!post.content && imageUrl) {
      title = "Shared an image";
    }
    title = `${title} [post:${post.id}]`;

    const topics = ["technology", "ai", "programming", "gaming", "science", "design", "ux", "marketing", "business", "startups", "funny", "devto", "general"];

    console.log(`Inserting candidate for post ${post.id}: "${title}"`);
    const { data: newCandidate, error: insertError } = await supabaseAdmin!
      .from("feed_candidates")
      .insert({
        candidate_type: "user_post",
        origin: origin,
        reference_id: post.id,
        title: title,
        summary: post.content || "",
        imageurl: imageUrl || undefined,
        importance: origin === "HUMAN" ? 0.9 : 0.85,
        topics: topics,
        published_at: post.created_at,
        expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error(`Failed to insert post ${post.id}:`, insertError.message);
    } else {
      console.log(`Successfully inserted candidate for post ${post.id}.`);
    }
  }
}

run();
