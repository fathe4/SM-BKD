import { chromium } from "playwright";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";
import { REDDIT_SUBREDDITS, getSubredditName } from "../../config/redditSimulationConfig";
import { LlmRendererService } from "./llmRenderer.service";

export interface ScrapedPost {
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  author: string;
  source: string;
}

export interface TwitterScrapedPost {
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  author: string;
  source: string;
  likes: number;
  retweets: number;
  replies: number;
  engagement: number;
  mediaType: "image" | "video";
  videoUrl: string | null;
}

export class ScraperService {
  private static isScraping: boolean = false;

  /**
   * Scrape posts from a subreddit using Playwright Chromium
   */
  public static async scrapeSubreddit(subreddit: string, limit: number = 10): Promise<ScrapedPost[]> {
    logger.info(`Starting Playwright scraping for r/${subreddit}...`);
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      });

      const page = await context.newPage();
      // Block stylesheet and font requests for performance
      await page.route("**/*.{css,font,woff,woff2}", (route) => {
        route.abort();
      });

      await page.goto(`https://www.reddit.com/r/${subreddit}/new/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      // Scroll to load dynamic feeds
      for (let i = 0; i < 2; i++) {
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(1000);
      }

      // Shreddit posts selector (Reddit's modern UI element)
      const shredditPosts = await page.locator("shreddit-post").all();
      const results: ScrapedPost[] = [];

      for (const postEl of shredditPosts) {
        if (results.length >= limit) break;

        try {
          const title = await postEl.getAttribute("post-title") || "";
          const permalink = await postEl.getAttribute("permalink") || "";
          const author = await postEl.getAttribute("author") || "unknown";
          const contentHref = await postEl.getAttribute("content-href") || "";
          
          let imageUrl: string | null = null;
          if (/\.(jpg|jpeg|png|webp|gif)/i.test(contentHref) || contentHref.includes("i.redd.it") || contentHref.includes("preview.redd.it")) {
            imageUrl = contentHref;
          }

          // Fallback image location search inside post element
          if (!imageUrl) {
            const imgEl = await postEl.locator("img[src*='preview.redd.it'], img[src*='i.redd.it'], shreddit-aspect-ratio img").first();
            if (await imgEl.isVisible()) {
              imageUrl = await imgEl.getAttribute("src");
            }
          }

          // Grab body paragraph text if exists
          let body = "";
          const bodyEl = await postEl.locator("[slot='text-body'], div[class*='text-body'], p").first();
          if (await bodyEl.isVisible()) {
            body = await bodyEl.innerText() || "";
          }

          if (title && permalink) {
            results.push({
              title,
              body: body.trim(),
              url: `https://www.reddit.com${permalink}`,
              imageUrl,
              author,
              source: `Reddit r/${subreddit}`
            });
          }
        } catch (e: any) {
          logger.warn(`Error parsing shreddit-post: ${e.message}`);
        }
      }

      // Fallback selector for standard layouts or old reddit
      if (results.length === 0) {
        logger.info("No shreddit-posts found. Trying fallback article tags...");
        const articles = await page.locator("article").all();
        for (const artEl of articles) {
          if (results.length >= limit) break;

          try {
            const titleEl = await artEl.locator("h3").first();
            const title = await titleEl.innerText() || "";

            const linkEl = await artEl.locator("a[href*='/comments/']").first();
            const href = await linkEl.getAttribute("href") || "";

            const imgEl = await artEl.locator("img").first();
            let imageUrl: string | null = null;
            if (await imgEl.isVisible()) {
              imageUrl = await imgEl.getAttribute("src");
            }

            let body = "";
            const bodyEl = await artEl.locator("p, [data-click-id='text']").first();
            if (await bodyEl.isVisible()) {
              body = await bodyEl.innerText() || "";
            }

            if (title && href) {
              results.push({
                title,
                body: body.trim(),
                url: href.startsWith("http") ? href : `https://www.reddit.com${href}`,
                imageUrl,
                author: "unknown",
                source: `Reddit r/${subreddit}`
              });
            }
          } catch (e: any) {
            // ignore
          }
        }
      }

      logger.info(`Successfully scraped ${results.length} posts from r/${subreddit}`);
      return results;
    } catch (err: any) {
      logger.error(`Error in scrapeSubreddit for r/${subreddit}: ${err.message}`);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Scrape tweets from a public Twitter/X profile using Playwright Chromium with anti-bot settings
   */
  public static async scrapeTwitterProfile(profile: string, limit: number = 10): Promise<TwitterScrapedPost[]> {
    logger.info(`Starting Playwright scraping for Twitter profile @${profile}...`);
    const sessionPath = "/home/fathe/Desktop/Social media/SM-BKD/src/scripts/twitter-session.json";
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled"
        ]
      });

      const hasSession = fs.existsSync(sessionPath);
      const context = await browser.newContext({
        storageState: hasSession ? sessionPath : undefined,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1024 }
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      const page = await context.newPage();

      // Intercept video streams
      const interceptedVideos: string[] = [];
      page.on("response", response => {
        const url = response.url();
        if (url.includes("video.twimg.com") && (url.includes(".mp4") || url.includes(".m3u8"))) {
          interceptedVideos.push(url);
        }
      });

      // Navigate to profile
      const url = `https://x.com/${profile}`;
      await page.goto(url, {
        waitUntil: "commit",
        timeout: 30000
      });

      // Wait 8 seconds for elements to render
      await page.waitForTimeout(8000);

      // Human-like scrolling & delay
      const waitTime = 3000 + Math.floor(Math.random() * 2000);
      await page.waitForTimeout(waitTime);
      await page.mouse.wheel(0, 1000 + Math.floor(Math.random() * 500));
      await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));

      // Parse modern Twitter/X article elements
      const results = await page.evaluate(() => {
        const parseMetric = (el: Element | null): number => {
          if (!el) return 0;
          const txt = el.textContent || "";
          if (txt.includes("K")) return parseFloat(txt.replace("K", "")) * 1000;
          if (txt.includes("M")) return parseFloat(txt.replace("M", "")) * 1000000;
          const num = parseInt(txt.replace(/[^0-9]/g, ""), 10);
          return isNaN(num) ? 0 : num;
        };

        const articles = Array.from(document.querySelectorAll("article"));
        return articles.map(article => {
          let userText = "unknown";
          const testidUser = article.querySelector('[data-testid="User-Name"]');
          if (testidUser) {
            userText = testidUser.textContent || "unknown";
          } else {
            const userSpan = Array.from(article.querySelectorAll("span")).find(s => s.textContent && s.textContent.includes("@"));
            if (userSpan) userText = userSpan.textContent;
          }

          const author = userText.split("\n").find(s => s.startsWith("@")) || userText.split("\n")[0] || "unknown";

          let text = "";
          const testidText = article.querySelector('[data-testid="tweetText"]');
          if (testidText) {
            text = (testidText as HTMLElement).innerText || "";
          } else {
            const textEl = Array.from(article.querySelectorAll("div")).find(el => {
              const cls = typeof el.className === "string" ? el.className : "";
              return cls.includes("whitespace-pre-wrap") && cls.includes("text-text") && el.textContent.trim().length > 0;
            });
            if (textEl) text = (textEl as HTMLElement).innerText || "";
          }

          // Detect video player
          const videoEl = article.querySelector("video");
          const hasVideo = !!(videoEl || article.querySelector('[data-testid="videoPlayer"]'));
          const videoPoster = videoEl ? videoEl.getAttribute("poster") : null;

          let imageUrl = null;
          const photoContainer = article.querySelector('[data-testid="tweetPhoto"]');
          if (photoContainer) {
            const img = photoContainer.querySelector("img");
            if (img) imageUrl = img.getAttribute("src");
          }
          if (!imageUrl) {
            const imgEl = Array.from(article.querySelectorAll("img")).find(img => img.src.includes("/media/"));
            imageUrl = imgEl ? imgEl.getAttribute("src") : null;
          }

          // If it has video, set imageUrl to poster image
          if (hasVideo && videoPoster) {
            imageUrl = videoPoster;
          }

          const linkEl = article.querySelector("a[href*='/status/']");
          const href = linkEl ? linkEl.getAttribute("href") || "" : "";
          const permalink = href ? `https://x.com${href}` : "";

          const replies = parseMetric(article.querySelector('[data-testid="reply"]'));
          const retweets = parseMetric(article.querySelector('[data-testid="retweet"]'));
          const likes = parseMetric(article.querySelector('[data-testid="like"]'));
          const engagement = replies + retweets + likes;

          return {
            title: text.length > 80 ? text.substring(0, 80) + "..." : text,
            body: text,
            url: permalink || `https://x.com`,
            imageUrl,
            author,
            source: permalink || `https://x.com`,
            likes,
            retweets,
            replies,
            engagement,
            hasVideo
          };
        }).filter(t => t.body || t.imageUrl);
      });

      // Match video URLs to findings
      let videoIdx = 0;
      const formattedResults: TwitterScrapedPost[] = results.map(t => {
        let mediaType: "image" | "video" = "image";
        let finalVideoUrl: string | null = null;

        if (t.hasVideo) {
          mediaType = "video";
          if (videoIdx < interceptedVideos.length) {
            finalVideoUrl = interceptedVideos[videoIdx++];
          } else {
            // Fallback to tweet status link if no mp4/m3u8 intercepted
            finalVideoUrl = t.url;
          }
        }

        return {
          title: t.title,
          body: t.body,
          url: t.url,
          imageUrl: t.imageUrl,
          author: t.author,
          source: t.source,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
          engagement: t.engagement,
          mediaType,
          videoUrl: finalVideoUrl
        };
      });

      logger.info(`Successfully scraped ${formattedResults.length} tweets from @${profile}`);
      return formattedResults.slice(0, limit);
    } catch (err: any) {
      logger.error(`Error in scrapeTwitterProfile for @${profile}: ${err.message}`);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Scrape tweets from the authenticated Twitter/X home feed page
   */
  public static async scrapeTwitterPersonalFeed(limit: number = 15): Promise<TwitterScrapedPost[]> {
    logger.info("Starting Playwright scraping for Twitter home feed...");
    const sessionPath = "/home/fathe/Desktop/Social media/SM-BKD/src/scripts/twitter-session.json";
    if (!fs.existsSync(sessionPath)) {
      logger.warn("No saved Twitter session found! Cannot scrape feed.");
      return [];
    }

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled"
        ]
      });

      const context = await browser.newContext({
        storageState: sessionPath,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1024 }
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      const page = await context.newPage();

      // Intercept video streams
      const interceptedVideos: string[] = [];
      page.on("response", response => {
        const url = response.url();
        if (url.includes("video.twimg.com") && (url.includes(".mp4") || url.includes(".m3u8"))) {
          interceptedVideos.push(url);
        }
      });

      await page.goto("https://x.com/home", {
        waitUntil: "commit",
        timeout: 30000
      });

      // Wait 8 seconds for feed items to render
      await page.waitForTimeout(8000);

      // Human-like scrolling & delay
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 400 + Math.floor(Math.random() * 300));
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 2000));
      }

      // Parse modern Twitter/X article elements
      const results = await page.evaluate(() => {
        const parseMetric = (el: Element | null): number => {
          if (!el) return 0;
          const txt = el.textContent || "";
          if (txt.includes("K")) return parseFloat(txt.replace("K", "")) * 1000;
          if (txt.includes("M")) return parseFloat(txt.replace("M", "")) * 1000000;
          const num = parseInt(txt.replace(/[^0-9]/g, ""), 10);
          return isNaN(num) ? 0 : num;
        };

        const articles = Array.from(document.querySelectorAll("article"));
        return articles.map(article => {
          let userText = "unknown";
          const testidUser = article.querySelector('[data-testid="User-Name"]');
          if (testidUser) {
            userText = testidUser.textContent || "unknown";
          } else {
            const userSpan = Array.from(article.querySelectorAll("span")).find(s => s.textContent && s.textContent.includes("@"));
            if (userSpan) userText = userSpan.textContent;
          }

          const author = userText.split("\n").find(s => s.startsWith("@")) || userText.split("\n")[0] || "unknown";

          let text = "";
          const testidText = article.querySelector('[data-testid="tweetText"]');
          if (testidText) {
            text = (testidText as HTMLElement).innerText || "";
          } else {
            const textEl = Array.from(article.querySelectorAll("div")).find(el => {
              const cls = typeof el.className === "string" ? el.className : "";
              return cls.includes("whitespace-pre-wrap") && cls.includes("text-text") && el.textContent.trim().length > 0;
            });
            if (textEl) text = (textEl as HTMLElement).innerText || "";
          }

          // Detect video player
          const videoEl = article.querySelector("video");
          const hasVideo = !!(videoEl || article.querySelector('[data-testid="videoPlayer"]'));
          const videoPoster = videoEl ? videoEl.getAttribute("poster") : null;

          let imageUrl = null;
          const photoContainer = article.querySelector('[data-testid="tweetPhoto"]');
          if (photoContainer) {
            const img = photoContainer.querySelector("img");
            if (img) imageUrl = img.getAttribute("src");
          }
          if (!imageUrl) {
            const imgEl = Array.from(article.querySelectorAll("img")).find(img => img.src.includes("/media/"));
            imageUrl = imgEl ? imgEl.getAttribute("src") : null;
          }

          // If it has video, set imageUrl to poster image
          if (hasVideo && videoPoster) {
            imageUrl = videoPoster;
          }

          const linkEl = article.querySelector("a[href*='/status/']");
          const href = linkEl ? linkEl.getAttribute("href") || "" : "";
          const permalink = href ? `https://x.com${href}` : "";

          const replies = parseMetric(article.querySelector('[data-testid="reply"]'));
          const retweets = parseMetric(article.querySelector('[data-testid="retweet"]'));
          const likes = parseMetric(article.querySelector('[data-testid="like"]'));
          const engagement = replies + retweets + likes;

          return {
            title: text.length > 80 ? text.substring(0, 80) + "..." : text,
            body: text,
            url: permalink || `https://x.com`,
            imageUrl,
            author,
            source: permalink || `https://x.com`,
            likes,
            retweets,
            replies,
            engagement,
            hasVideo
          };
        }).filter(t => t.body || t.imageUrl);
      });

      // Match video URLs to findings
      let videoIdx = 0;
      const formattedResults: TwitterScrapedPost[] = results.map(t => {
        let mediaType: "image" | "video" = "image";
        let finalVideoUrl: string | null = null;

        if (t.hasVideo) {
          mediaType = "video";
          if (videoIdx < interceptedVideos.length) {
            finalVideoUrl = interceptedVideos[videoIdx++];
          } else {
            // Fallback to tweet status link if no mp4/m3u8 intercepted
            finalVideoUrl = t.url;
          }
        }

        return {
          title: t.title,
          body: t.body,
          url: t.url,
          imageUrl: t.imageUrl,
          author: t.author,
          source: t.source,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
          engagement: t.engagement,
          mediaType,
          videoUrl: finalVideoUrl
        };
      });

      logger.info(`Successfully scraped ${formattedResults.length} feed tweets`);
      return formattedResults.slice(0, limit);
    } catch (err: any) {
      logger.error(`Error in scrapeTwitterPersonalFeed: ${err.message}`);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Scrape tweets from a specific Twitter/X search topic using live results
   */
  public static async scrapeTwitterSearch(topic: string, limit: number = 15): Promise<TwitterScrapedPost[]> {
    logger.info(`Starting Playwright scraping for Twitter search topic: "${topic}"...`);
    const sessionPath = "/home/fathe/Desktop/Social media/SM-BKD/src/scripts/twitter-session.json";
    
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled"
        ]
      });

      const hasSession = fs.existsSync(sessionPath);
      const context = await browser.newContext({
        storageState: hasSession ? sessionPath : undefined,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1024 }
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      const page = await context.newPage();

      // Intercept video streams
      const interceptedVideos: string[] = [];
      page.on("response", response => {
        const url = response.url();
        if (url.includes("video.twimg.com") && (url.includes(".mp4") || url.includes(".m3u8"))) {
          interceptedVideos.push(url);
        }
      });

      // Go to live search results for query
      const url = `https://x.com/search?f=live&q=${encodeURIComponent(topic)}`;
      await page.goto(url, {
        waitUntil: "commit",
        timeout: 30000
      });

      // Wait 8 seconds for search results to render
      await page.waitForTimeout(8000);

      // Human-like scrolling & delay
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 400 + Math.floor(Math.random() * 300));
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 2000));
      }

      // Parse articles
      const results = await page.evaluate(() => {
        const parseMetric = (el: Element | null): number => {
          if (!el) return 0;
          const txt = el.textContent || "";
          if (txt.includes("K")) return parseFloat(txt.replace("K", "")) * 1000;
          if (txt.includes("M")) return parseFloat(txt.replace("M", "")) * 1000000;
          const num = parseInt(txt.replace(/[^0-9]/g, ""), 10);
          return isNaN(num) ? 0 : num;
        };

        const articles = Array.from(document.querySelectorAll("article"));
        return articles.map(article => {
          let userText = "unknown";
          const testidUser = article.querySelector('[data-testid="User-Name"]');
          if (testidUser) {
            userText = testidUser.textContent || "unknown";
          } else {
            const userSpan = Array.from(article.querySelectorAll("span")).find(s => s.textContent && s.textContent.includes("@"));
            if (userSpan) userText = userSpan.textContent;
          }

          const author = userText.split("\n").find(s => s.startsWith("@")) || userText.split("\n")[0] || "unknown";

          let text = "";
          const testidText = article.querySelector('[data-testid="tweetText"]');
          if (testidText) {
            text = (testidText as HTMLElement).innerText || "";
          } else {
            const textEl = Array.from(article.querySelectorAll("div")).find(el => {
              const cls = typeof el.className === "string" ? el.className : "";
              return cls.includes("whitespace-pre-wrap") && cls.includes("text-text") && el.textContent.trim().length > 0;
            });
            if (textEl) text = (textEl as HTMLElement).innerText || "";
          }

          // Detect video player
          const videoEl = article.querySelector("video");
          const hasVideo = !!(videoEl || article.querySelector('[data-testid="videoPlayer"]'));
          const videoPoster = videoEl ? videoEl.getAttribute("poster") : null;

          let imageUrl = null;
          const photoContainer = article.querySelector('[data-testid="tweetPhoto"]');
          if (photoContainer) {
            const img = photoContainer.querySelector("img");
            if (img) imageUrl = img.getAttribute("src");
          }
          if (!imageUrl) {
            const imgEl = Array.from(article.querySelectorAll("img")).find(img => img.src.includes("/media/"));
            imageUrl = imgEl ? imgEl.getAttribute("src") : null;
          }

          // If it has video, set imageUrl to poster image
          if (hasVideo && videoPoster) {
            imageUrl = videoPoster;
          }

          const linkEl = article.querySelector("a[href*='/status/']");
          const href = linkEl ? linkEl.getAttribute("href") || "" : "";
          const permalink = href ? `https://x.com${href}` : "";

          const replies = parseMetric(article.querySelector('[data-testid="reply"]'));
          const retweets = parseMetric(article.querySelector('[data-testid="retweet"]'));
          const likes = parseMetric(article.querySelector('[data-testid="like"]'));
          const engagement = replies + retweets + likes;

          return {
            title: text.length > 80 ? text.substring(0, 80) + "..." : text,
            body: text,
            url: permalink || `https://x.com`,
            imageUrl,
            author,
            source: permalink || `https://x.com`,
            likes,
            retweets,
            replies,
            engagement,
            hasVideo
          };
        }).filter(t => t.body || t.imageUrl);
      });

      // Match video URLs to findings
      let videoIdx = 0;
      const formattedResults: TwitterScrapedPost[] = results.map(t => {
        let mediaType: "image" | "video" = "image";
        let finalVideoUrl: string | null = null;

        if (t.hasVideo) {
          mediaType = "video";
          if (videoIdx < interceptedVideos.length) {
            finalVideoUrl = interceptedVideos[videoIdx++];
          } else {
            // Fallback to tweet status link if no mp4/m3u8 intercepted
            finalVideoUrl = t.url;
          }
        }

        return {
          title: t.title,
          body: t.body,
          url: t.url,
          imageUrl: t.imageUrl,
          author: t.author,
          source: t.source,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
          engagement: t.engagement,
          mediaType,
          videoUrl: finalVideoUrl
        };
      });

      logger.info(`Successfully scraped ${formattedResults.length} search results for "${topic}"`);
      return formattedResults.slice(0, limit);
    } catch (err: any) {
      logger.error(`Error in scrapeTwitterSearch for "${topic}": ${err.message}`);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Run the Scraper Pipeline and insert posts with image attachments into feed_candidates
   */
  public static async runScraperPipeline(
    subreddits: string[] = REDDIT_SUBREDDITS,
    twitterProfiles: string[] = ["Can_TheOnee", "linadreaamy", "YashRMFC", "elonmusk", "levelsio", "dril", "iamdevloper", "trolled_dev", "shitpost_bot", "software_jokes"]
  ): Promise<number> {
    if (this.isScraping) {
      logger.info("Scraper pipeline is already running. Skipping concurrent execution.");
      return 0;
    }
    this.isScraping = true;
    try {
      logger.info("Starting Playwright Scraper Pipeline...");
      let totalIngested = 0;

    // 1. Reddit scraping — DISABLED (Twitter only mode)
    logger.info("Reddit scraping is disabled. Skipping Reddit loop.");

    // 2. Scrape Twitter profiles
    logger.info("Executing Twitter scraping loop...");
    for (const profile of twitterProfiles) {
      const posts = await this.scrapeTwitterProfile(profile, 5);

      for (const post of posts) {
        // Enforce: Must have image attachment
        if (!post.imageUrl) {
          logger.info(`Skipping tweet "${post.title}" because it has no image attachment.`);
          continue;
        }

        // Filter out potential adult content
        if (containsAdultContent(post.title) || containsAdultContent(post.body) || containsAdultContent(post.imageUrl || "") || containsAdultContent(post.url || "")) {
          logger.info(`Skipping tweet because it contains potential adult content: "${post.title}"`);
          continue;
        }

        // Rule for Can_TheOnee: only get high engagement posts
        const profileLower = profile.toLowerCase();
        const isCanTheOnee = profileLower === "can_theonee" || post.author?.toLowerCase().includes("can_theonee");
        if (isCanTheOnee && post.engagement < 200) {
          logger.info(`Skipping tweet from @${profile} due to low engagement (${post.engagement} < 200).`);
          continue;
        }

        try {
          // Check duplicate in feed_candidates by title or source url in metadata_json
          let dupFeed = null;
          const { data: titleDup } = await supabaseAdmin!
            .from("feed_candidates")
            .select("id")
            .eq("title", post.title)
            .limit(1)
            .maybeSingle();

          if (titleDup) {
            dupFeed = titleDup;
          } else if (post.url) {
            const { data: urlDup } = await supabaseAdmin!
              .from("feed_candidates")
              .select("id")
              .eq("metadata_json->>source_url", post.url)
              .limit(1)
              .maybeSingle();
            dupFeed = urlDup;
          }

          if (dupFeed) continue;

          // Check duplicate in scraped_candidates using imageurl
          const { data: dupScraped } = await supabaseAdmin!
            .from("scraped_candidates")
            .select("id")
            .eq("image_url", post.imageUrl)
            .maybeSingle();

          if (dupScraped) continue;

          // Category mapping
          let category = "technology";
          if (["dril", "can_theonee", "linadreaamy", "iamdevloper", "trolled_dev", "shitpost_bot", "software_jokes", "levelsio"].includes(profileLower)) {
            category = "funny";
          } else if (profileLower === "yashrmfc") {
            category = "general";
          } else if (post.title.toLowerCase().includes("ai") || post.title.toLowerCase().includes("gpt") || profileLower === "elonmusk") {
            category = "ai";
          }

          // Cache in scraped_candidates table
          await supabaseAdmin!
            .from("scraped_candidates")
            .insert({
              source: "twitter",
              source_username: profileLower,
              raw_content: JSON.stringify({
                title: post.title,
                body: post.body,
                url: post.url,
                author: post.author,
                likes: post.likes,
                retweets: post.retweets,
                replies: post.replies,
                engagement: post.engagement,
                mediaType: post.mediaType,
                videoUrl: post.videoUrl
              }),
              category,
              image_url: post.imageUrl,
              moderated_status: "pending",
              is_used: false,
              expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
            });

        } catch (e: any) {
          logger.error(`Error caching scraped tweet "${post.title}": ${e.message}`);
        }
      }
    }

    // 3. Retrieve all pending scraped candidates to moderate and process in batches of 20
    const { data: pendingCandidates, error: fetchErr } = await supabaseAdmin!
      .from("scraped_candidates")
      .select("*")
      .eq("moderated_status", "pending")
      .eq("is_used", false);

    if (fetchErr) {
      logger.error(`Failed to fetch pending scraped candidates: ${fetchErr.message}`);
      return 0;
    }

    if (!pendingCandidates || pendingCandidates.length === 0) {
      logger.info("No pending scraped candidates found to moderate.");
      return 0;
    }

    logger.info(`Found ${pendingCandidates.length} pending scraped candidates to moderate in batches.`);

    const batchSize = 20;
    for (let i = 0; i < pendingCandidates.length; i += batchSize) {
      const chunk = pendingCandidates.slice(i, i + batchSize);
      logger.info(`Moderating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pendingCandidates.length / batchSize)} (size: ${chunk.length})...`);

      const postsToModerate = chunk.map((c: any) => {
        try {
          const raw = JSON.parse(c.raw_content);
          return {
            title: raw.title,
            body: raw.body || "",
            source: c.source === "reddit" ? `Reddit r/${c.source_username}` : `Twitter @${c.source_username}`
          };
        } catch {
          return { title: c.raw_content, body: "", source: c.source };
        }
      });

      // Direct raw content mode: approve all scraped candidates without calling LLM moderation
      const approvedIndices = postsToModerate.map((_, idx) => idx);
      const approvedSet = new Set(approvedIndices);

      for (let j = 0; j < chunk.length; j++) {
        const candidateDb = chunk[j];
        
        let raw;
        try {
          raw = JSON.parse(candidateDb.raw_content);
        } catch {
          raw = { title: candidateDb.raw_content, body: "", url: "", author: "unknown" };
        }

        if (!approvedSet.has(j)) {
          // Reject candidate
          await supabaseAdmin!
            .from("scraped_candidates")
            .update({ moderated_status: "rejected" })
            .eq("id", candidateDb.id);
          logger.info(`Rejected candidate: "${raw.title}"`);
          continue;
        }

        // Direct raw content mode: bypass pre-generating variations using LLM
        const variations = null;

        // Ingest into feed_candidates
        try {
          let exists = null;
          const { data: titleDup } = await supabaseAdmin!
            .from("feed_candidates")
            .select("id")
            .eq("title", raw.body || raw.title)
            .limit(1)
            .maybeSingle();

          if (titleDup) {
            exists = titleDup;
          } else if (raw.url) {
            const { data: urlDup } = await supabaseAdmin!
              .from("feed_candidates")
              .select("id")
              .eq("metadata_json->>source_url", raw.url)
              .limit(1)
              .maybeSingle();
            exists = urlDup;
          }

          if (exists) {
            logger.info(`Candidate with title "${raw.title}" already exists in feed_candidates. Skipping duplicate insertion.`);
            await supabaseAdmin!
              .from("scraped_candidates")
              .update({
                moderated_status: "approved",
                is_used: true
              })
              .eq("id", candidateDb.id);
            continue;
          }

          const score = 0.35 + Math.random() * 0.15;
          const { data: newCandidate, error: insertError } = await supabaseAdmin!
            .from("feed_candidates")
            .insert({
              candidate_type: candidateDb.category === "funny" ? "trending_discussion" : "news",
              origin: "NEWS",
              title: raw.body || raw.title,
              summary: raw.body || raw.title,
              source: candidateDb.source === "reddit" ? `Reddit r/${candidateDb.source_username}` : `Twitter @${candidateDb.source_username}`,
              imageurl: candidateDb.image_url,
              importance: score,
              topics: [candidateDb.category, candidateDb.source_username, candidateDb.source],
              metadata_json: {
                scraped_author: raw.author,
                source_url: raw.url,
                platform: candidateDb.source,
                score,
                pre_generated_posts: variations
              },
              published_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
            })
            .select()
            .single();

          if (insertError) {
            if (insertError.code === "23505") {
              logger.info(`Candidate with title "${raw.title}" already exists in feed_candidates (unique violation). Skipping duplicate insertion.`);
              await supabaseAdmin!
                .from("scraped_candidates")
                .update({
                  moderated_status: "approved",
                  is_used: true
                })
                .eq("id", candidateDb.id);
              continue;
            } else {
              throw insertError;
            }
          }

          if (newCandidate) {
            totalIngested++;
            await supabaseAdmin!.from("content_metrics").insert({
              feed_candidate_id: newCandidate.id,
              views: 0,
              likes: 0,
              comments: 0,
              novelty: 1.0
            });

            // Mark approved and used in scraped_candidates
            await supabaseAdmin!
              .from("scraped_candidates")
              .update({
                moderated_status: "approved",
                is_used: true,
                pre_generated_posts: variations
              })
              .eq("id", candidateDb.id);

            logger.info(`Successfully Ingested and Pre-Generated: "${raw.title}"`);
          }
        } catch (err: any) {
          logger.error(`Error inserting candidate "${raw.title}": ${err.message}`);
        }
      }
    }

    logger.info(`Playwright Scraper Pipeline complete. Ingested & pre-generated ${totalIngested} safe candidates.`);
    return totalIngested;
    } finally {
      this.isScraping = false;
    }
  }
}

function containsAdultContent(text: string): boolean {
  if (!text) return false;
  const lowercaseText = text.toLowerCase();
  const adultKeywords = [
    "nsfw", "porn", "sex", "naked", "nude", "erotic", "scat", "poop", 
    "piss", "fart", "ass", "boob", "dick", "vagina", "hentai", 
    "adult content", "xxx", "onlyfans", "ofans", "escort"
  ];
  return adultKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b|${keyword}`, 'i');
    return regex.test(lowercaseText);
  });
}
