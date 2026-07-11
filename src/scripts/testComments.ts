import { supabaseAdmin } from "../config/supabase";

async function queryPostComments() {
  const postId = "72dc78f7-da36-4dee-8adc-389b03d1e564";
  console.log(`Querying comments for post: ${postId}`);

  const { data: comments, error } = await supabaseAdmin!
    .from("comments")
    .select("id, content, user_id, users(username, is_ai)")
    .eq("post_id", postId);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${comments?.length} comments:`);
  console.log(JSON.stringify(comments, null, 2));
}

queryPostComments().then(() => process.exit(0));
