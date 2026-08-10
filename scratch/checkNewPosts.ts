import { supabaseAdmin } from "../src/config/supabase";

async function checkNewPosts() {
  if (!supabaseAdmin) {
    console.error("supabaseAdmin is null");
    return;
  }

  // Fetch posts from today
  const { data: posts, error } = await supabaseAdmin
    .from("posts")
    .select("id, content, created_at, user_id, is_ai_generated")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching posts:", error.message);
  } else {
    console.log("Most recent posts in the database:");
    console.log(JSON.stringify(posts, null, 2));
  }
}

checkNewPosts().then(() => process.exit(0));
