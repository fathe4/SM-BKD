import Parser from "rss-parser";
import axios from "axios";
import { LlmProvider } from "../llm/llmProvider";
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



const FEED_SOURCES = [
  { category: "technology", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { category: "technology", url: "https://www.wired.com/feed/rss" },
  { category: "design", url: "https://www.smashingmagazine.com/feed/" },
  { category: "design", url: "https://uxdesign.cc/feed" },
  { category: "marketing", url: "https://blog.hubspot.com/marketing/rss.xml" },
  { category: "marketing", url: "https://www.socialmediaexaminer.com/feed/" },
  { category: "business", url: "https://www.entrepreneur.com/latest.rss" },
  { category: "business", url: "https://techcrunch.com/feed/" },
  { category: "gaming", url: "https://www.gamespot.com/feeds/mashup/" },
  { category: "entertainment", url: "https://www.hollywoodreporter.com/feed/" }
];

const DEVTO_TAGS = [
  "ai",
  "programming",
  "webdev",
  "startup",
  "design",
  "ux",
  "marketing",
  "gaming",
  "funny"
];

interface RawArticle {
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  source: string;
  publishedAt: string;
  category: string;
}

interface DiscoveredTopic {
  title: string;
  summary: string;
  category: string;
  keywords: string[];
  emotion: string;
  importance: number;
  discussionPotential: number;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
}

export class DiscoveryService {
  /**
   * Upload image to Cloudinary using remote URL fetch.
   * Falls back to original URL on failure.
   */
  private static async uploadToCloudinary(imageUrl: string): Promise<string | null> {
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
      if (!cloudName || !uploadPreset) return imageUrl;

      const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const form = new FormData();
      form.append("file", imageUrl);
      form.append("upload_preset", uploadPreset);

      const response = await axios.post(url, form, { timeout: 10000 });
      return response.data.secure_url as string;
    } catch (e: any) {
      logger.warn(`Discovery Cloudinary upload failed: ${e.message}. Using original URL.`);
      return imageUrl;
    }
  }

  /**
   * Extract image URL from RSS item
   */
  private static extractRssImage(item: any): string | null {
    if (item.enclosure?.url && /\.(jpg|jpeg|png|webp|gif)/i.test(item.enclosure.url)) {
      return item.enclosure.url;
    }
    if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    if (item['itunes:image']?.href) return item['itunes:image'].href;

    const content = item.content || item['content:encoded'] || item.summary || '';
    const srcMatch = content.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i);
    if (srcMatch?.[1]) return srcMatch[1];

    const ogMatch = content.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || content.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    return null;
  }

  /**
   * Fetch raw articles from RSS feeds and DEV.to
   */
  private static async gatherRawArticles(): Promise<RawArticle[]> {
    const articles: RawArticle[] = [];

    // 1. Gather RSS articles (latest 2 from each source)
    for (const source of FEED_SOURCES) {
      try {
        const response = await axios.get(source.url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const feed = await parser.parseString(response.data);
        if (!feed.items || feed.items.length === 0) continue;

        const items = feed.items.slice(0, 2);
        for (const item of items) {
          if (!item.title) continue;
          const imageUrl = this.extractRssImage(item);
          const summary = item.contentSnippet || item.content || "";
          articles.push({
            title: item.title,
            summary: summary.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000),
            url: item.link || source.url,
            imageUrl,
            source: feed.title || source.category,
            publishedAt: new Date(item.pubDate || Date.now()).toISOString(),
            category: source.category
          });
        }
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        logger.error(`Discovery RSS error fetching ${source.url}: ${err.message}`);
      }
    }

    // 2. Gather DEV.to articles (latest 2 from each tag)
    for (const tag of DEVTO_TAGS) {
      try {
        const url = `https://dev.to/api/articles?tag=${tag}&per_page=2&top=1`;
        const response = await axios.get(url, {
          timeout: 6000,
          headers: { 'User-Agent': 'SocialSimulatorDiscovery/1.0' }
        });
        const list = response.data || [];
        for (const article of list) {
          if (!article.title) continue;
          articles.push({
            title: article.title,
            summary: (article.description || article.title || "").slice(0, 1000),
            url: article.url || "https://dev.to",
            imageUrl: article.cover_image || article.social_image || null,
            source: `DEV.to #${tag}`,
            publishedAt: new Date(article.published_at || Date.now()).toISOString(),
            category: tag
          });
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        logger.error(`Discovery DEV.to error fetching tag #${tag}: ${err.message}`);
      }
    }

    return articles;
  }

  /**
   * Run the LLM normalization & deduplication step
   */
  private static async extractAndNormalize(rawArticles: RawArticle[]): Promise<DiscoveredTopic[]> {
    if (rawArticles.length === 0) return [];

    const prompt = `
You are a Content Discovery Agent. Inspect this list of recent articles and topics gathered from the web.
Your job is to extract the most interesting, trending, and unique topics.
Deduplicate any overlapping stories or news items, merging them into a single topic.
Select only the best topics that would make high-quality, engaging social media posts.

For each topic, return a structured object with:
- title: clear, engaging title of the event/news.
- summary: a short summary of the key facts (2-3 sentences max).
- category: one of [technology, ai, design, marketing, startups, business, gaming, entertainment, general].
- keywords: array of 3-5 relevant keywords.
- emotion: dominant emotional reaction (e.g., surprise, curiosity, concern, amusement, excitement).
- importance: importance score from 0.0 to 1.0 (how significant is this event?).
- discussionPotential: discussion/engagement potential score from 0.0 to 1.0.
- source: name of the source or publication.
- url: original article url.
- imageUrl: image url (if present in the raw article data).
- publishedAt: ISO timestamp of publication.

Return the topics inside a JSON object with a top-level key "topics" containing the list.

Raw articles list:
${JSON.stringify(rawArticles.map(a => ({
  title: a.title,
  summary: a.summary.slice(0, 300),
  url: a.url,
  imageUrl: a.imageUrl,
  source: a.source,
  publishedAt: a.publishedAt,
  category: a.category
})))}
`;

    try {
      const client = LlmProvider.for("topic_extract");
      const response = await client.complete({
        messages: [
          { role: "system", content: "You are an expert system that extracts, normalizes, and deduplicates news articles into structured JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const result = JSON.parse(response.content || "{}");
      return (result.topics || []) as DiscoveredTopic[];
    } catch (e: any) {
      logger.error(`LLM topic extraction failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Score a topic mathematically: Score = Importance + DiscussionPotential + Freshness + CategoryWeight
   */
  private static calculateScore(topic: DiscoveredTopic): number {
    const ageHours = (Date.now() - new Date(topic.publishedAt).getTime()) / (1000 * 3600);
    // Freshness decays from 1.0 (0 hours) to 0.0 (48+ hours)
    const freshness = Math.max(0, 1.0 - (ageHours / 48));

    // Category weights
    const weights: Record<string, number> = {
      ai: 0.5,
      technology: 0.4,
      startups: 0.4,
      design: 0.35,
      marketing: 0.3,
      business: 0.3,
      gaming: 0.2,
      entertainment: 0.15,
      general: 0.1
    };
    const catWeight = weights[topic.category.toLowerCase()] || 0.1;

    return topic.importance + topic.discussionPotential + freshness + catWeight;
  }

  /**
   * Run the full Content Discovery Pipeline
   */
  public static async runDiscoveryPipeline(): Promise<number> {
    logger.info("Content Discovery Pipeline (RSS Feeds & DEV.to) is disabled by configuration.");
    return 0;
  }
}
