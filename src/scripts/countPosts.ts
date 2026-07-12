import { supabaseAdmin } from "../config/supabase";

async function main() {
  const { data: posts, error } = await supabaseAdmin!
    .from("posts")
    .select("id, content, created_at, visibility, is_deleted, user_id, users(username)");

  if (error) {
    console.error("Error fetching posts:", error.message);
    return;
  }

  console.log(`Total posts in 'posts' table: ${posts.length}`);
  posts.forEach((p, idx) => {
    console.log(`[${idx + 1}] ID: ${p.id} | User: @${(p.users as any)?.username} | Visibility: ${p.visibility} | Deleted: ${p.is_deleted} | Content: "${p.content.substring(0, 80)}"`);
  });
}

main();
