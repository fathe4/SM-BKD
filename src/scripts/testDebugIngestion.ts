import { supabaseAdmin } from "../config/supabase";

async function run() {
  const postId = "5a008961-977e-49be-9132-126aac3f5ea1";
  console.log(`Checking post ${postId} directly...`);
  
  const { data: post, error } = await supabaseAdmin!
    .from("posts")
    .select("id, user_id, content, created_at, is_deleted, users(username, is_ai)")
    .eq("id", postId)
    .single();

  if (error) {
    console.error("Query Error:", error);
    return;
  }
  
  console.log("Raw post record:", post);

  // Check if duplicate exists
  const { data: duplicate } = await supabaseAdmin!
    .from("feed_candidates")
    .select("id")
    .eq("reference_id", postId)
    .maybeSingle();

  console.log("Duplicate check in feed_candidates:", duplicate);
}

run().then(() => process.exit(0));
