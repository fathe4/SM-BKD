import { chromium } from "playwright";
import { config } from "dotenv";
config();

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1024 }
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(4000);

  // type username
  const u = page.locator('input[name="username_or_email"]').first();
  await u.click();
  await u.pressSequentially(process.env.TWITTER_USERNAME!, { delay: 50 });
  // click continue
  const btns = page.locator('button:text-is("Continue"), button:text-is("Next")');
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    if (await btns.nth(i).isVisible().catch(() => false)) {
      await btns.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(4000);

  console.log("URL now:", page.url());
  // Dump the password screen structure: forms, buttons with DOM context
  const info = await page.evaluate(() => {
    const pws = Array.from(document.querySelectorAll('input[type="password"]'));
    const out: any[] = [];
    for (const pw of pws) {
      const form = pw.closest("form");
      let formButtons: any[] = [];
      if (form) {
        formButtons = Array.from(form.querySelectorAll("button")).map(b => ({
          tag: "button",
          type: b.type,
          testid: (b as HTMLElement).dataset.testid || "",
          text: (b.textContent || "").trim().slice(0, 40),
          disabled: b.disabled,
          pwVisible: false
        }));
      }
      // also check the sheet/parent structure
      const sheet = pw.closest('[role="dialog"], [data-testid], section, main');
      out.push({
        pwName: (pw as HTMLInputElement).name,
        pwVisible: !!(pw as HTMLElement).offsetParent,
        formPresent: !!form,
        formButtons,
        closestSheet: sheet ? sheet.tagName + (sheet.className && typeof sheet.className === "string" ? "." + sheet.className.split(" ").slice(0, 2).join(".") : "") : null
      });
    }
    return out;
  });
  console.log("PASSWORD SCREEN STRUCTURE:", JSON.stringify(info, null, 2));

  await page.screenshot({ path: "/tmp/pw-screen.png" });
  await browser.close();
}
main().catch(e => { console.error("probe failed:", e.message); process.exit(1); });
