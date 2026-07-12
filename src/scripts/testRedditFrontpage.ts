import { chromium } from "playwright";
import * as path from "path";

async function main() {
  console.log("=== Playwright Reddit Frontpage Scraper Test ===");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 1024 }
    });

    const page = await context.newPage();
    console.log("Navigating to https://www.reddit.com/ ...");
    
    // Set wait to 'commit' to bypass heavy network resources hangs
    await page.goto("https://www.reddit.com/", {
      waitUntil: "commit",
      timeout: 20000
    });

    console.log("HTML loading committed. Waiting 5s for initial render...");
    await page.waitForTimeout(5000);

    // Scroll to trigger lazy loading
    console.log("Scrolling to fetch content...");
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(2000);
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(2000);

    // Take screenshot for debugging/verification
    const screenshotPath = path.join(__dirname, "reddit-frontpage.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved page screenshot to: ${screenshotPath}`);

    const shredditPosts = await page.locator("shreddit-post").all();
    console.log(`Found ${shredditPosts.length} shreddit-post elements.`);

    const posts = [];
    for (const postEl of shredditPosts) {
      const title = await postEl.getAttribute("post-title") || "";
      const permalink = await postEl.getAttribute("permalink") || "";
      const author = await postEl.getAttribute("author") || "unknown";
      const subreddit = await postEl.getAttribute("subreddit-prefixed-name") || "unknown";
      const contentHref = await postEl.getAttribute("content-href") || "";

      let imageUrl: string | null = null;
      if (/\.(jpg|jpeg|png|webp|gif)/i.test(contentHref) || contentHref.includes("i.redd.it") || contentHref.includes("preview.redd.it")) {
        imageUrl = contentHref;
      }

      if (!imageUrl) {
        const imgEl = await postEl.locator("img[src*='preview.redd.it'], img[src*='i.redd.it'], shreddit-aspect-ratio img").first();
        if (await imgEl.isVisible()) {
          imageUrl = await imgEl.getAttribute("src");
        }
      }

      posts.push({
        title,
        permalink: `https://www.reddit.com${permalink}`,
        author,
        subreddit,
        imageUrl
      });
    }

    if (posts.length === 0) {
      console.log("No shreddit-posts found. Trying fallback article tags...");
      const articles = await page.locator("article").all();
      for (const artEl of articles) {
        try {
          const titleEl = await artEl.locator("h3").first();
          const title = await titleEl.innerText();
          
          const linkEl = await artEl.locator("a[href*='/comments/']").first();
          const href = await linkEl.getAttribute("href") || "";

          const imgEl = await artEl.locator("img").first();
          let imageUrl: string | null = null;
          if (await imgEl.isVisible()) {
            imageUrl = await imgEl.getAttribute("src");
          }

          if (title && href) {
            posts.push({
              title,
              permalink: href.startsWith("http") ? href : `https://www.reddit.com${href}`,
              author: "unknown",
              subreddit: "unknown",
              imageUrl
            });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    console.log(`\n--- SCRAPED REDDIT FRONTPAGE POSTS (${posts.length}) ---`);
    console.log(JSON.stringify(posts.slice(0, 10), null, 2));

  } catch (err: any) {
    console.error("Scraping error:", err.message);
  } finally {
    await browser.close();
  }
}

main();
