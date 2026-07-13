import Parser from "rss-parser";
import axios from "axios";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['enclosure', 'enclosure'],
    ],
  }
});

// Regular RSS feeds — use sources known to include og:image / enclosure images
const FEED_MAP: Record<string, string[]> = {
  "technology": [
    "https://feeds.arstechnica.com/arstechnica/technology-lab",  // includes images
    "https://www.wired.com/feed/rss"                             // includes images
  ],
  "design": [
    "https://www.smashingmagazine.com/feed/",                    // includes images
    "https://uxdesign.cc/feed"                                   // includes images
  ],
  "marketing": [
    "https://blog.hubspot.com/marketing/rss.xml",               // includes images
    "https://www.socialmediaexaminer.com/feed/"                 // includes images
  ]
};

// DEV.to community tags to scrape (open API, no auth, no rate limits)
const DEVTO_MAP: Record<string, string[]> = {
  "technology": ["programming", "ai", "career", "webdev"],
  "design": ["design", "ux", "css", "frontend"],
  "marketing": ["marketing", "startup", "productivity", "business"]
};

/**
 * Upload image to Cloudinary using remote URL fetch (fast, no buffer download needed).
 * Falls back to returning the original URL if Cloudinary is unavailable.
 */
async function uploadToCloudinary(imageUrl: string): Promise<string | null> {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) return null;

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const form = new FormData();
    form.append("file", imageUrl);        // remote URL — Cloudinary fetches it directly
    form.append("upload_preset", uploadPreset);

    const uploadResponse = await axios.post(url, form, { timeout: 12000 });
    return uploadResponse.data.secure_url as string;
  } catch (e: any) {
    logger.warn(`Cloudinary upload failed for ${imageUrl.slice(0, 60)}: ${e.message}. Using original URL.`);
    // Return original URL as fallback so posts still get images
    return imageUrl;
  }
}

/**
 * Extract image URL from RSS item using multiple strategies
 */
function extractRssImage(item: any): string | null {
  // Strategy 1: enclosure (podcasts, some blogs)
  if (item.enclosure?.url && /\.(jpg|jpeg|png|webp|gif)/i.test(item.enclosure.url)) {
    return item.enclosure.url;
  }
  // Strategy 2: media:content
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  if (item['media:content']?.$?.url) return item['media:content'].$.url;
  // Strategy 3: itunes:image
  if (item['itunes:image']?.href) return item['itunes:image'].href;
  // Strategy 4: og:image / img src in content
  const content = item.content || item['content:encoded'] || item.summary || '';
  const srcMatch = content.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i);
  if (srcMatch?.[1]) return srcMatch[1];
  // Strategy 5: og:image meta tag in content
  const ogMatch = content.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || content.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) return ogMatch[1];
  return null;
}

export class IngestionService {
  /**
   * Ingest RSS articles into feed_candidates
   */
  static async ingestRssFeeds(): Promise<number> {
    // DISABLED — RSS ingestion is turned off. Only Twitter/Reddit scraping is active.
    logger.info("RSS feed ingestion is disabled. Skipping.");
    return 0;

    let count = 0; // unreachable — kept for easy re-enable
    for (const [category, urls] of Object.entries(FEED_MAP)) {
      for (const url of urls) {
        try {
          // Sleep for 1.5 seconds to respect rate limits and avoid 429s
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Fetch XML using Axios with a timeout and user-agent
          const response = await axios.get(url, { 
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          const feed = await parser.parseString(response.data);
          
          if (!feed.items || feed.items.length === 0) continue;

          // Take the latest 3 items to avoid flooding
          const items = feed.items.slice(0, 3);
          for (const item of items) {
            const title = item.title || "";
            if (!title) continue;

            // Check duplicate by title or source url in metadata_json
            let duplicate = null;
            const { data: titleDup } = await supabaseAdmin!
              .from("feed_candidates")
              .select("id")
              .eq("title", title)
              .limit(1)
              .maybeSingle();

            if (titleDup) {
              duplicate = titleDup;
            } else if (item.link) {
              const { data: urlDup } = await supabaseAdmin!
                .from("feed_candidates")
                .select("id")
                .eq("metadata_json->>source_url", item.link)
                .limit(1)
                .maybeSingle();
              duplicate = urlDup;
            }

            if (duplicate) continue;

            // Extract image using multi-strategy helper
            const rawImageUrl = extractRssImage(item);
            let finalImageUrl: string | null = null;
            if (rawImageUrl) {
              finalImageUrl = await uploadToCloudinary(rawImageUrl!);
              if (finalImageUrl) {
                logger.info(`RSS image found for "${title.slice(0, 40)}": ${finalImageUrl!.slice(0, 60)}`);
              }
            }

            const cleanSummary = item.contentSnippet || item.content || "";

            const { data: newCandidate } = await supabaseAdmin!
              .from("feed_candidates")
              .insert({
                candidate_type: "news",
                origin: "NEWS",
                title: title,
                summary: cleanSummary.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000),
                imageurl: finalImageUrl || undefined,
                importance: finalImageUrl ? 0.75 : 0.6, // boost importance for articles with images
                topics: [category, "news"],
                metadata_json: {
                  source_url: item.link || undefined
                },
                published_at: new Date(item.pubDate || Date.now()).toISOString(),
                expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
              })
              .select()
              .single();

            if (newCandidate) {
              count++;
              await supabaseAdmin!.from("content_metrics").insert({
                feed_candidate_id: newCandidate.id,
                views: 0, likes: 0, comments: 0, novelty: 1.0
              });
            }
          }
        } catch (err) {
          logger.error(`Error ingesting RSS feed ${url}: ${err}`);
        }
      }
    }
    return count;
  }

  /**
   * Ingest trending discussions from DEV.to community (open API, no auth required)
   * Acts as a Reddit replacement — real developer/professional discussions
   */
  static async ingestRedditPosts(): Promise<number> {
    // DISABLED — DEV.to/Reddit ingestion via this service is turned off. Only Twitter (Playwright) scraping is active.
    logger.info("DEV.to/Reddit ingestion service is disabled. Skipping.");
    return 0;

    let count = 0;
    for (const [category, tags] of Object.entries(DEVTO_MAP)) {
      for (const tag of tags) {
        try {
          await new Promise(r => setTimeout(r, 500));

          const url = `https://dev.to/api/articles?tag=${tag}&per_page=3&top=1`;
          const response = await axios.get(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'SocialSimulator/1.0' }
          });

          const articles: any[] = response.data || [];
          if (!articles.length) continue;

          for (const article of articles) {
            const title = article.title as string;
            const summary = (article.description || article.title || "") as string;
            if (!title) continue;

            // Check duplicate by title or source url in metadata_json
            let dup = null;
            const { data: titleDup } = await supabaseAdmin!
              .from("feed_candidates")
              .select("id")
              .eq("title", title)
              .limit(1)
              .maybeSingle();

            if (titleDup) {
              dup = titleDup;
            } else if (article.url) {
              const { data: urlDup } = await supabaseAdmin!
                .from("feed_candidates")
                .select("id")
                .eq("metadata_json->>source_url", article.url)
                .limit(1)
                .maybeSingle();
              dup = urlDup;
            }

            if (dup) continue;

            // Upload cover image if available
            let cloudinaryUrl: string | null = null;
            if (article.cover_image || article.social_image) {
              cloudinaryUrl = await uploadToCloudinary(article.cover_image || article.social_image);
            }

            const { data: newCandidate } = await supabaseAdmin!
              .from("feed_candidates")
              .insert({
                candidate_type: "trending_discussion",
                origin: "SYSTEM",
                title: title,
                summary: summary.slice(0, 1000),
                imageurl: cloudinaryUrl || undefined,
                importance: 0.65,
                topics: [category, "devto"],
                metadata_json: {
                  source_url: article.url || undefined
                },
                published_at: new Date(article.published_at || Date.now()).toISOString(),
                expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
              })
              .select()
              .single();

            if (newCandidate) {
              count++;
              await supabaseAdmin!.from("content_metrics").insert({
                feed_candidate_id: newCandidate.id,
                views: 0, likes: 0, comments: 0, novelty: 1.0
              });
              logger.info(`DEV.to [#${tag}]: ingested "${title.slice(0, 60)}"`);
            }
          }
        } catch (err: any) {
          logger.error(`Error ingesting DEV.to tag #${tag}: ${err.message}`);
        }
      }
    }
    return count;
  }

  /**
   * Ingest recent posts from user_posts or ai_posts
   */
  static async ingestUserPosts(): Promise<number> {
    // Fetch posts created in the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const { data: posts, error } = await supabaseAdmin!
      .from("posts")
      .select("id, user_id, content, created_at, is_ai_generated, users(username, is_ai), post_media(media_url)")
      .gt("created_at", sixHoursAgo)
      .eq("is_deleted", false);

    if (error || !posts) {
      logger.error(`Error fetching posts for ingestion: ${error?.message}`);
      return 0;
    }

    // Fetch all personas to quickly map interests
    const { data: personaList } = await supabaseAdmin!
      .from("persona_identities")
      .select("user_id, profession, username");
    
    const personaMap = new Map<string, { profession: string; username: string }>();
    if (personaList) {
      personaList.forEach((p: any) => {
        personaMap.set(p.user_id, { profession: p.profession, username: p.username });
      });
    }

    let count = 0;
    for (const post of posts) {
      // Check duplicate
      const { data: duplicate } = await supabaseAdmin!
        .from("feed_candidates")
        .select("id")
        .eq("reference_id", post.id)
        .maybeSingle();

      if (duplicate) continue;

      const user = post.users as any;
      const origin = user?.is_ai ? "AI" : "HUMAN";
      
      const mediaList = post.post_media as any[];
      const imageUrl = mediaList && mediaList.length > 0 ? mediaList[0].media_url : null;

      let title = post.content ? post.content.slice(0, 80) + "..." : "New Post";
      if (!post.content && imageUrl) {
        title = "Shared an image";
      }
      // Bypasses feed_candidates_title_unique unique constraint by appending post ID
      title = `${title} [post:${post.id}]`;

      let topics = ["general"];
      if (origin === "HUMAN") {
        // Human posts should be seen by everyone, so we assign all primary topics
        topics = ["technology", "ai", "programming", "gaming", "science", "design", "ux", "marketing", "business", "startups", "funny", "devto", "general"];
      } else {
        // AI persona posts: assign broad topics so they reach all personas in the feed
        // Start with universal topics that match all interestedCategories
        topics = ["technology", "ai", "programming", "gaming", "science", "design", "ux", "marketing", "business", "startups", "funny", "devto", "general"];
      }

      const { data: newCandidate } = await supabaseAdmin!
        .from("feed_candidates")
        .insert({
          candidate_type: "user_post",
          origin: origin,
          reference_id: post.id,
          title: `[post:${post.id}]`, // Metadata pointer, resolved dynamically
          summary: "", // Do not duplicate content
          imageurl: null, // Do not duplicate imageUrl
          importance: origin === "HUMAN" ? 0.9 : 0.85, // Humans and AI personas get high initial ranking
          topics: topics,
          published_at: post.created_at,
          expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString() // Expires in 72 hours
        })
        .select()
        .single();

      if (newCandidate) {
        count++;
        // Initialize metrics
        await supabaseAdmin!.from("content_metrics").insert({
          feed_candidate_id: newCandidate.id,
          views: 0,
          likes: 0,
          comments: 0,
          novelty: 1.0
        });
      }
    }
    return count;
  }

  /**
   * Ingest a single post immediately into feed_candidates
   */
  static async ingestSinglePost(postId: string): Promise<any> {
    try {
      const { data: post, error } = await supabaseAdmin!
        .from("posts")
        .select("id, user_id, content, created_at, is_ai_generated, users(username, is_ai), post_media(media_url)")
        .eq("id", postId)
        .single();

      if (error || !post) {
        logger.error(`Error fetching post ${postId} for ingestion: ${error?.message}`);
        return null;
      }

      // Check duplicate
      const { data: duplicate } = await supabaseAdmin!
        .from("feed_candidates")
        .select("id")
        .eq("reference_id", post.id)
        .maybeSingle();

      if (duplicate) return duplicate;

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

      const { data: newCandidate } = await supabaseAdmin!
        .from("feed_candidates")
        .insert({
          candidate_type: "user_post",
          origin: origin,
          reference_id: post.id,
          title: `[post:${post.id}]`, // Metadata pointer, resolved dynamically
          summary: "", // Do not duplicate content
          imageurl: null, // Do not duplicate imageUrl
          importance: origin === "HUMAN" ? 0.9 : 0.85,
          topics: topics,
          published_at: post.created_at,
          expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
        })
        .select()
        .single();

      if (newCandidate) {
        // Initialize metrics
        await supabaseAdmin!.from("content_metrics").insert({
          feed_candidate_id: newCandidate.id,
          views: 0,
          likes: 0,
          comments: 0,
          novelty: 1.0
        });
        return newCandidate;
      }
    } catch (err: any) {
      logger.error(`Error ingesting single post ${postId}: ${err.message}`);
    }
    return null;
  }
}
