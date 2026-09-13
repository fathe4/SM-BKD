import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1024 }
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(6000);

  const state = await page.evaluate(() => {
    const vis = (el: Element) => !!(el as HTMLElement).offsetParent || !!(el as HTMLElement).getClientRects().length;
    const bodyText = (document.body.innerText || "").slice(0, 600);
    return {
      url: location.href,
      usernameInputPresent: Array.from(document.querySelectorAll('input[name="username_or_email"], input[autocomplete^="username"]')).some(vis),
      bodyTextPreview: bodyText.replace(/\n{2,}/g, " | ")
    };
  });
  console.log("PROBE RESULT:", JSON.stringify(state, null, 2));
  await page.screenshot({ path: "/tmp/login-state-probe.png" });
  await browser.close();
}
main().catch(e => { console.error("probe failed:", e.message); process.exit(1); });
