import { chromium } from "playwright";
import * as path from "path";

async function main() {
  console.log("=== Playwright Twitter/X Public Topic Scraper Test ===");
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
    
    // Forward browser console logs to node console
    page.on("console", msg => console.log("BROWSER:", msg.text()));
    
    // We scrape a public query search on X. It loads without login if we request it properly.
    // Test navigating to a public profile instead of search to see if profiles are login-gated.
    const url = "https://x.com/elonmusk";
    console.log(`Navigating to Twitter profile: ${url} ...`);
    
    await page.goto(url, {
      waitUntil: "commit",
      timeout: 25000
    });

    console.log("Navigation committed. Waiting 6s for dynamic content loading...");
    await page.waitForTimeout(6000);

    // Scroll to load posts
    console.log("Scrolling to fetch tweets...");
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(3000);

    // Take screenshot for verification
    const screenshotPath = path.join(__dirname, "twitter.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Parse modern Twitter/X article elements on browser side to avoid Playwright locator timeouts
    const results = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll("article"));
      console.log(`Found ${articles.length} articles inside evaluate`);

      return articles.map((article, index) => {
        // Find the span containing '@' for user details
        const userSpan = Array.from(article.querySelectorAll("span")).find(s => s.textContent && s.textContent.includes("@"));
        const userText = userSpan ? userSpan.textContent : "unknown";

        // Tweet text is in a div with whitespace-pre-wrap and text-text class names
        const textEl = Array.from(article.querySelectorAll("div")).find(el => {
          const cls = typeof el.className === "string" ? el.className : "";
          return cls.includes("whitespace-pre-wrap") && cls.includes("text-text") && el.textContent.trim().length > 0;
        });
        const text = textEl ? (textEl as HTMLElement).innerText : "";

        // Photo/Image URL inside tweet media (not profile image)
        const imgEl = Array.from(article.querySelectorAll("img")).find(img => img.src.includes("/media/"));
        const imageUrl = imgEl ? imgEl.getAttribute("src") : null;

        // Link to the tweet containing '/status/'
        const linkEl = article.querySelector("a[href*='/status/']");
        const href = linkEl ? linkEl.getAttribute("href") || "" : "";
        const permalink = href ? `https://x.com${href}` : "";

        return {
          index,
          user: userText ? userText.split("\n").join(" | ") : "unknown",
          text: text.trim().replace(/\s+/g, " "),
          imageUrl,
          permalink
        };
      });
    });

    console.log(`\n--- SCRAPED TWITTER/X TWEETS (${results.length}) ---`);
    console.log(JSON.stringify(results.slice(0, 10), null, 2));

  } catch (err: any) {
    console.error("Scraping error:", err.message);
  } finally {
    await browser.close();
  }
}

main();
