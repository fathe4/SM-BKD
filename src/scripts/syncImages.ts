import { supabaseAdmin } from "../config/supabase";

async function main() {
  console.log("Syncing post_media URLs to existing feed_candidates...");
  
  const { data: candidates, error: err } = await supabaseAdmin!
    .from("feed_candidates")
    .select("id, reference_id")
    .not("reference_id", "is", null);

  if (err) {
    console.error("Error fetching candidates:", err);
    return;
  }

  console.log(`Found ${candidates?.length || 0} post candidates to check.`);

  for (const c of candidates || []) {
    const { data: media } = await supabaseAdmin!
      .from("post_media")
      .select("media_url")
      .eq("post_id", c.reference_id)
      .limit(1)
      .maybeSingle();

    if (media && media.media_url) {
      console.log(`Updating candidate ${c.id} with image: ${media.media_url}`);
      await supabaseAdmin!
        .from("feed_candidates")
        .update({
          imageUrl: media.media_url,
          imageurl: media.media_url,
          title: "Shared an image"
        })
        .eq("id", c.id);
    }
  }
}

main().then(() => process.exit(0));
