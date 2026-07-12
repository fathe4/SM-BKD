import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";

const SESSION_PATH = path.join(__dirname, "twitter-session.json");

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function main() {
  console.log("\n========================================================");
  console.log("🐦 Twitter/X Personalized Home Feed Scraper 🐦");
  console.log("========================================================\n");

  const sessionExists = fs.existsSync(SESSION_PATH);

  if (!sessionExists) {
    console.log("⚠️ No active session found. Initiating manual login sequence...");
    console.log("Opening browser window with anti-bot stealth configurations. Please log in.");
    
    const browser = await chromium.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled" // Disables navigator.webdriver flag
      ]
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 1024 }
    });

    // Remove webdriver flag to bypass X login wall detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    const page = await context.newPage();
    
    // Go to X Login
    await page.goto("https://x.com/i/flow/login");

    console.log("\n👉 ACTION REQUIRED: Please log in to X inside the browser window.");
    console.log("👉 Once you successfully see your Home Feed, return here.");
    
    await askQuestion("\nPress [Enter] here in the terminal once you are logged in and see your home feed to save the session... ");

    // Save session
    await context.storageState({ path: SESSION_PATH });
    console.log(`\n✅ Session saved successfully to: ${SESSION_PATH}`);
    
    await browser.close();
    console.log("Browser closed. You can now run this script again to scrape in headless mode!\n");
  } else {
    console.log("✅ Active session found. Attempting headless scraping of X Home Feed...");

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled" // Disables navigator.webdriver flag
      ]
    });

    try {
      const context = await browser.newContext({
        storageState: SESSION_PATH,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1024 }
      });

      // Mask webdriver flag in headless mode too
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      const page = await context.newPage();
      
      console.log("Navigating to X Home Feed...");
      await page.goto("https://x.com/home", {
        waitUntil: "commit",
        timeout: 30000
      });

      // Simulating natural human-like scrolling to bypass behavior detectors
      console.log("Simulating natural scrolling & loading...");
      for (let i = 0; i < 3; i++) {
        // Scroll down by a random, moderate distance
        const scrollDistance = 300 + Math.floor(Math.random() * 400);
        await page.mouse.wheel(0, scrollDistance);
        
        // Wait a random duration between 2s and 4.5s to mimic reading
        const readTime = 2000 + Math.floor(Math.random() * 2500);
        console.log(`   [Scroll ${i + 1}] Reading for ${(readTime / 1000).toFixed(1)}s...`);
        await page.waitForTimeout(readTime);
      }

      // Take a screenshot of the loaded feed to verify we are logged in
      const screenshotPath = path.join(__dirname, "twitter-feed-screenshot.png");
      await page.screenshot({ path: screenshotPath });
      console.log(`Saved verification screenshot to: ${screenshotPath}`);

      // Parse the feed elements
      console.log("Parsing home feed posts...");
      const tweets = await page.evaluate(() => {
        const articles = Array.from(document.querySelectorAll("article"));
        return articles.map((article, index) => {
          // 1. Resolve User Name / ID
          let userText = "unknown";
          const testidUser = article.querySelector('[data-testid="User-Name"]');
          if (testidUser) {
            userText = testidUser.textContent || "unknown";
          } else {
            const userSpan = Array.from(article.querySelectorAll("span")).find(s => s.textContent && s.textContent.includes("@"));
            if (userSpan) userText = userSpan.textContent;
          }

          // 2. Resolve Tweet Text Content
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

          // 3. Attached media images
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

          // 4. Permalink status
          const linkEl = article.querySelector("a[href*='/status/']");
          const href = linkEl ? linkEl.getAttribute("href") || "" : "";
          const permalink = href ? `https://x.com${href}` : "";

          return {
            index,
            user: userText.split("\n").join(" | ").trim(),
            text: text.trim().replace(/\s+/g, " "),
            imageUrl,
            permalink
          };
        }).filter(t => t.text || t.imageUrl);
      });

      console.log(`\n--- SCRAPED HOME FEED TWEETS (${tweets.length}) ---`);
      console.log(JSON.stringify(tweets.slice(0, 10), null, 2));

    } catch (error: any) {
      console.error("❌ Scraping failed:", error.message);
    } finally {
      await browser.close();
    }
  }
}

main();
