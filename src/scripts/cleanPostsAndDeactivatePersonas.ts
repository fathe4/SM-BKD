import { supabaseAdmin } from "../config/supabase";

async function main() {
  console.log("=== Clean Up Simulation DB for Witty AI Image Testing ===");

  // 1. Delete all posts
  console.log("Deleting all posts from Supabase database...");
  const { error: postDeleteError } = await supabaseAdmin!
    .from("posts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // deletes all rows since none will match this dummy ID

  if (postDeleteError) {
    console.error("Error deleting posts:", postDeleteError);
  } else {
    console.log("Successfully deleted all posts, comments, likes, and post media!");
  }

  // 2. Fetch some top humor personas to keep active
  const { data: topPersonas, error: fetchErr } = await supabaseAdmin!
    .from("persona_identities")
    .select("id, username, user_id")
    .order("humor", { ascending: false })
    .limit(3);

  if (fetchErr || !topPersonas || topPersonas.length === 0) {
    console.error("Could not fetch top personas to keep active.");
    return;
  }

  const activeUserIds = topPersonas.map((p: any) => p.user_id);
  const activeUsernames = topPersonas.map((p: any) => p.username);
  console.log(`Keeping the following 3 AI personas ACTIVE: ${activeUsernames.join(", ")}`);

  // 3. Deactivate all AI personas
  console.log("Deactivating all AI personas...");
  const { error: deactivateErr } = await supabaseAdmin!
    .from("ai_personas")
    .update({ is_active: false })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deactivateErr) {
    console.error("Error deactivating personas:", deactivateErr);
    return;
  }

  // 4. Activate the selected 3 personas
  console.log("Activating the selected 3 AI personas...");
  const { error: activateErr } = await supabaseAdmin!
    .from("ai_personas")
    .update({ is_active: true })
    .in("user_id", activeUserIds);

  if (activateErr) {
    console.error("Error activating selected personas:", activateErr);
    return;
  }

  console.log("Database reset complete! Only 3 AI personas are active now.");
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
