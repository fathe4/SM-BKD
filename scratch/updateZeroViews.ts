import { supabaseAdmin } from "../src/config/supabase";

async function run() {
  const { data: posts, error } = await supabaseAdmin!
    .from("posts")
    .select("id, content, view_count")
    .eq("view_count", 0);

  if (error) {
    console.error("Error fetching posts:", error.message);
    return;
  }

  console.log(`Found ${posts?.length || 0} posts with 0 views.`);

  if (posts && posts.length > 0) {
    for (const post of posts) {
      const initialViews = Math.floor(12 + Math.random() * 30); // Random views between 12 and 41
      const { error: updateErr } = await supabaseAdmin!
        .from("posts")
        .update({ view_count: initialViews })
        .eq("id", post.id);

      if (updateErr) {
        console.error(`Failed to update post ${post.id}:`, updateErr.message);
      } else {
        console.log(`Updated post "${post.content?.slice(0, 30)}..." with ${initialViews} views.`);
      }
    }
  }
}

run();
