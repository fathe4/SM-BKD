import { supabaseAdmin } from "../src/config/supabase";

async function run() {
  console.log("Fetching all AI personas...");
  const { data: aiUsers, error } = await supabaseAdmin!
    .from("users")
    .select("id, username, first_name, last_name, profile_picture")
    .eq("is_ai", true);

  if (error || !aiUsers) {
    console.error("Failed to fetch AI users:", error?.message);
    return;
  }

  console.log(`Found ${aiUsers.length} AI personas. Updating profile pictures with real human male avatars only...`);

  let maleCount = 1;

  for (const user of aiUsers) {
    const firstName = user.first_name || "";
    
    // Use male portraits for all personas to ensure no female photos are added
    const avatarUrl = `https://randomuser.me/api/portraits/men/${maleCount}.jpg`;
    maleCount = (maleCount % 99) + 1; // loop back if exceeding 99

    console.log(`Updating @${user.username} (${firstName}): ${avatarUrl}`);

    const { error: updateErr } = await supabaseAdmin!
      .from("users")
      .update({ profile_picture: avatarUrl })
      .eq("id", user.id);

    if (updateErr) {
      console.error(`Failed to update @${user.username}:`, updateErr.message);
    }
  }

  console.log("All AI personas profile pictures have been updated with real male face images successfully.");
}

run();
