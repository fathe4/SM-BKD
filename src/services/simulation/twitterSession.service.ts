import { chromium, Browser, BrowserContext, Locator, Page } from "playwright";
import { config } from "dotenv";
import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";

config();

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const TWITTER_HOME = "https://x.com/home";
const TWITTER_LOGIN = "https://x.com/i/flow/login";
const ANTI_BOT_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  // Server-friendly flags: VPS containers have tiny /dev/shm and no GPU —
  // without these, headless Chrome hangs on a blank page forever
  "--disable-dev-shm-usage",
  "--disable-gpu"
];

export type SessionStatus = "valid" | "expired" | "no-session" | "error";

/**
 * Single source of truth for the Twitter/X Playwright session lifecycle:
 *  - resolves the storageState file path
 *  - detects login walls (expired sessions) on any page
 *  - validates the session and persists rotated cookies (ct0 etc.) back to disk
 *  - re-acquires the session dynamically: automated credential login via
 *    TWITTER_USERNAME/TWITTER_PASSWORD env vars, with a headed manual-login
 *    popup fallback
 */
export class TwitterSessionService {
  /** Prevents concurrent refresh attempts (cron runs every minute). */
  private static refreshInProgress: boolean = false;
  private static lastRefreshAttempt: number = 0;
  private static readonly REFRESH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Resolve the twitter-session.json storageState path.
   * Order: cwd/src, module-relative src, cwd/dist (compiled).
   */
  public static getSessionPath(): string {
    const cwdPath = path.join(process.cwd(), "src/scripts/twitter-session.json");
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }
    const relativePath = path.resolve(__dirname, "../../scripts/twitter-session.json");
    if (fs.existsSync(relativePath)) {
      return relativePath;
    }
    const cwdDistPath = path.join(process.cwd(), "dist/scripts/twitter-session.json");
    if (fs.existsSync(cwdDistPath)) {
      return cwdDistPath;
    }
    return relativePath;
  }

  /**
   * True when the current process can open a headed (visible) browser
   * for manual login — requires a desktop display on Linux.
   */
  public static canDoManualLogin(): boolean {
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }

  /**
   * Detect a login wall on an already-navigated page.
   * When the session is dead, X either redirects to the login flow or
   * renders a "Sign in" prompt while the URL stays put.
   */
  public static async detectLoginWall(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      if (url.includes("/i/flow/login") || url.includes("/login")) {
        return true;
      }
      // Logged-out pages show a "Sign in" button / username field; the
      // account switcher only exists when logged in.
      const loggedOutMarker = await page.$(
        '[data-testid="loginButton"], input[autocomplete="username"]'
      );
      if (loggedOutMarker) {
        return true;
      }
      const loggedInMarker = await page.$('[data-testid="SideNav_AccountSwitcher_Button"]');
      return !loggedInMarker && (url.includes("x.com") || url.includes("twitter.com"));
    } catch {
      return false;
    }
  }

  /**
   * Create a Playwright context with the saved session (when present) and
   * the shared anti-bot fingerprint used across the scrapers.
   */
  public static async createContext(browser: Browser): Promise<BrowserContext> {
    const sessionPath = this.getSessionPath();
    const hasSession = fs.existsSync(sessionPath);
    const context = await browser.newContext({
      storageState: hasSession ? sessionPath : undefined,
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 1024 }
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined
      });
    });
    return context;
  }

  /**
   * Persist the context's current cookies/localStorage to the session file,
   * keeping rotated cookies (ct0 etc.) fresh on disk.
   */
  public static async persistState(context: BrowserContext, backup = false): Promise<void> {
    const sessionPath = this.getSessionPath();
    try {
      if (backup && fs.existsSync(sessionPath)) {
        fs.copyFileSync(sessionPath, sessionPath.replace(/\.json$/, ".old.json"));
      }
      await context.storageState({ path: sessionPath });
      logger.info(`Twitter session state persisted to ${sessionPath}`);
    } catch (e: any) {
      logger.warn(`Failed to persist Twitter session state: ${e.message}`);
    }
  }

  /**
   * Headlessly validate the saved session against x.com/home.
   * When valid, rotated cookies are written back to disk (session keepalive).
   */
  public static async validateSession(): Promise<SessionStatus> {
    const sessionPath = this.getSessionPath();
    if (!fs.existsSync(sessionPath)) {
      logger.warn("No saved Twitter session found.");
      return "no-session";
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await chromium.launch({ headless: true, args: ANTI_BOT_ARGS });
      context = await this.createContext(browser);
      const page = await context.newPage();

      await page.goto(TWITTER_HOME, { waitUntil: "commit", timeout: 30000 });
      // Give the SPA time to settle or redirect to the login flow
      await page.waitForTimeout(5000);

      if (await this.detectLoginWall(page)) {
        logger.error("TWITTER_SESSION_EXPIRED: saved session is no longer authenticated.");
        return "expired";
      }

      // Session is alive — write rotated cookies back to disk
      await this.persistState(context);
      logger.info("Twitter session is valid (rotated cookies persisted).");
      return "valid";
    } catch (e: any) {
      logger.error(`Twitter session validation failed: ${e.message}`);
      return "error";
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Random pause between minMs and maxMs — humanizes timing patterns.
   */
  private static humanDelay(minMs: number, maxMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
  }

  /**
   * Type with humanized rhythm: jittered per-key delays plus occasional
   * "thinking" pauses. Uniform machine cadence is a behavioral bot tell.
   */
  private static async humanType(locator: Locator, text: string): Promise<void> {
    await locator.click({ timeout: 5000 }).catch(() => undefined);
    for (const ch of text) {
      await locator.press(ch);
      await this.humanDelay(60, 200);
      if (Math.random() < 0.08) {
        await this.humanDelay(200, 600);
      }
    }
  }

  /**
   * Move the mouse to the target along a jittered multi-step path, hover
   * briefly, then click with slight coordinate noise.
   */
  private static async humanMouseMoveClick(page: Page, x: number, y: number): Promise<void> {
    const steps = 8 + Math.floor(Math.random() * 6);
    const startX = Math.max(1, x + (Math.random() - 0.5) * 400);
    const startY = Math.max(1, y + (Math.random() - 0.5) * 300);
    await page.mouse.move(startX, startY);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        startX + (x - startX) * t + (Math.random() - 0.5) * 6,
        startY + (y - startY) * t + (Math.random() - 0.5) * 6
      );
      await this.humanDelay(8, 30);
    }
    await this.humanDelay(100, 300); // hover before clicking
    await page.mouse.click(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4);
  }

  /**
   * Persistent browser profile dir shared by the credential and Google
   * OAuth login flows — accumulated history/state defeats bot scoring.
   */
  private static getProfileDir(): string {
    return path.join(path.dirname(this.getSessionPath()), "twitter-login-profile");
  }

  /**
   * Launch the persistent profile in the real installed Chrome when
   * available (authentic fingerprint + real UA), else bundled Chromium.
   */
  private static async launchProfileContext(headless: boolean): Promise<BrowserContext> {
    const userDataDir = this.getProfileDir();
    const launchOptions: any = {
      headless,
      viewport: { width: 1280, height: 1024 },
      args: ANTI_BOT_ARGS
    };
    try {
      return await chromium.launchPersistentContext(userDataDir, {
        ...launchOptions,
        channel: "chrome"
      });
    } catch {
      return await chromium.launchPersistentContext(userDataDir, launchOptions);
    }
  }

  /**
   * True when the persistent profile carries an authenticated Google
   * session (SID/HSID/SAPISID cookies) — the prerequisite for the
   * automated "Continue with Google" flow.
   */
  private static async hasGoogleSession(context: BrowserContext): Promise<boolean> {
    const cookies = await context.cookies("https://accounts.google.com");
    return cookies.some(c => ["SAPISID", "SID", "HSID"].includes(c.name));
  }

  /**
   * Click a button/role=button element by (exact or contained) visible text,
   * using a humanized mouse path — bypasses Playwright actionability checks
   * that disagree with the DOM on X's animated sheets.
   */
  private static async clickElementByText(
    page: Page,
    texts: string[],
    opts: { contains?: boolean; selector?: string } = {}
  ): Promise<boolean> {
    const box = await page
      .evaluate(
        ({ txts, contains, sel }) => {
          const els = Array.from(document.querySelectorAll(sel || "button, [role='button']"));
          for (const el of els) {
            const t = (el.textContent || "").trim();
            const match = contains ? txts.some(x => t.includes(x)) : txts.includes(t);
            if (match && ((el as HTMLElement).offsetParent || (el as HTMLElement).getClientRects().length)) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
              }
            }
          }
          return null;
        },
        { txts: texts, contains: !!opts.contains, sel: opts.selector || "" }
      )
      .catch(() => null);
    if (box) {
      console.log(
        `[twitter-login] mouse-clicking "${texts.join("/")}" element at (${Math.round(box.x)}, ${Math.round(box.y)})`
      );
      await this.humanMouseMoveClick(page, box.x, box.y);
      return true;
    }
    return false;
  }

  /**
   * True when any username input is visible on the page.
   */
  private static async anyUsernameInputVisible(page: Page): Promise<boolean> {
    for (const sel of [
      'input[name="username_or_email"]',
      'input[autocomplete^="username"]',
      'input[name="text"]'
    ]) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  /**
   * One-time setup: open a visible browser and wait for the user to sign
   * in to Google manually. The persistent profile keeps the session so the
   * automated X login can reuse it (no Google password is ever stored).
   */
  public static async googleSetup(timeoutMs: number = 10 * 60 * 1000): Promise<boolean> {
    if (!this.canDoManualLogin()) {
      logger.error("googleSetup requires a desktop display to open the browser window.");
      return false;
    }
    let context: BrowserContext | null = null;
    try {
      context = await this.launchProfileContext(false);
      const page = await context.newPage();
      await page.goto("https://accounts.google.com/", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      if (await this.hasGoogleSession(context)) {
        console.log("✅ Google session already present in the profile — nothing to do.");
        return true;
      }

      const message =
        "ACTION REQUIRED: sign in to your Google account (the one linked to your X account) in the opened browser window. " +
        `Waiting up to ${Math.round(timeoutMs / 60000)} minutes...`;
      logger.warn(message);
      console.log(`\n👉 ${message}\n`);

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await this.hasGoogleSession(context)) {
          console.log("\n✅ Google sign-in detected — profile saved for automated X logins.");
          return true;
        }
        await page.waitForTimeout(2000);
      }
      logger.error("Google sign-in timed out.");
      return false;
    } catch (e: any) {
      logger.error(`googleSetup failed: ${e.message}`);
      return false;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  /**
   * Pick the Google account in the OAuth account chooser. Tries several DOM
   * shapes across Google's chooser versions (v3 uses different markup),
   * falling back to any visible element containing an email address.
   */
  private static async clickGoogleAccount(page: Page, email: string): Promise<boolean> {
    const target = await page
      .evaluate((em: string) => {
        const visible = (el: HTMLElement) =>
          !!(el.offsetParent || el.getClientRects().length) &&
          el.getBoundingClientRect().width > 0 &&
          el.getBoundingClientRect().height > 0;
        const center = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };

        // 1. Classic chooser rows carry data-identifier="<email>"
        const rows = Array.from(document.querySelectorAll("[data-identifier]")) as HTMLElement[];
        const byId = em
          ? rows.find(r => (r.getAttribute("data-identifier") || "").toLowerCase() === em.toLowerCase())
          : null;
        if (byId && visible(byId)) {
          return { ...center(byId), how: "data-identifier" };
        }
        const anyId = rows.find(visible);
        if (anyId) {
          return { ...center(anyId), how: "data-identifier" };
        }

        // 2. Newer choosers mark rows with data-authuser
        const authRows = Array.from(document.querySelectorAll("[data-authuser]")) as HTMLElement[];
        const byAuth = em
          ? authRows.find(r => (r.textContent || "").toLowerCase().includes(em.toLowerCase()))
          : null;
        if (byAuth && visible(byAuth)) {
          return { ...center(byAuth), how: "data-authuser" };
        }

        // 3. Fallback: any visible element whose text contains an email
        //    address (the account row) — pick the one matching the env email
        //    when provided, else the first.
        const all = Array.from(document.querySelectorAll<HTMLElement>("div, li, button, a"));
        const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
        const candidates = all.filter(el => {
          const t = (el.textContent || "").trim();
          return t.length < 120 && emailRe.test(t) && visible(el);
        });
        // Prefer smallest matching elements (the row itself, not containers)
        const match = em
          ? candidates.filter(el => (el.textContent || "").toLowerCase().includes(em.toLowerCase()))
          : candidates;
        const smallest = match.sort((a, b) => a.textContent!.length - b.textContent!.length)[0];
        if (smallest) {
          return { ...center(smallest), how: "email-text" };
        }
        return null;
      }, email)
      .catch(() => null);
    if (target) {
      console.log(`[twitter-login] clicking Google account row (${target.how})`);
      await this.humanMouseMoveClick(page, target.x, target.y);
      return true;
    }
    return false;
  }

  /**
   * Automated X login via "Continue with Google": relies on the Google
   * session pre-authorized in the persistent profile (googleSetup), so the
   * only automated steps are clicking the Google button, picking the
   * account, and approving consent — no credentials typed, no Google
   * bot-wall to fight.
   */
  public static async loginWithGoogle(headless = true): Promise<boolean> {
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      logger.info(`Attempting Twitter login via Google OAuth (${headless ? "headless" : "headed"})...`);
      if (!fs.existsSync(this.getProfileDir())) {
        logger.warn("No browser profile yet — run 'npm run twitter:google-setup' first.");
        return false;
      }
      context = await this.launchProfileContext(headless);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined
        });
      });
      page = await context.newPage();

      if (!(await this.hasGoogleSession(context))) {
        logger.warn("Google session missing/expired in profile — run 'npm run twitter:google-setup'.");
        return false;
      }

      await page.goto("https://x.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);

      // Open the login form if the homepage doesn't show it directly
      if (!(await this.anyUsernameInputVisible(page))) {
        await this.clickElementByText(page, ["Sign in"]);
        await page.waitForTimeout(3000);
      }

      // "Continue with Google" — a div[role=button] with localized text, so
      // match by the "Google" substring on both buttons and role=buttons
      if (
        !(await this.clickElementByText(page, ["Google"], {
          contains: true,
          selector: "div[role='button'], button"
        }))
      ) {
        throw new Error("'Continue with Google' button not found");
      }

      // The OAuth page opens either in this tab or a popup
      let oauthPage: Page | null = null;
      const popupPromise = new Promise<Page | null>(resolve => {
        context!.once("page", (p: Page) => resolve(p));
      });
      await page.waitForTimeout(4000);
      if (page.url().includes("accounts.google.com")) {
        oauthPage = page;
      } else {
        oauthPage = await Promise.race([
          popupPromise,
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
        ]);
      }
      if (!oauthPage) {
        throw new Error("Google OAuth page did not open");
      }

      await oauthPage.waitForTimeout(2000);
      if (oauthPage.url().includes("ServiceLogin") || oauthPage.url().includes("signin/identifier")) {
        throw new Error("Google session expired — run 'npm run twitter:google-setup' again");
      }

      // Account chooser (if shown): match the row by email text across
      // Google's chooser DOM variants. NOTE: on success the popup may close
      // itself right after the click (OAuth form_post back to x.com).
      if (await this.clickGoogleAccount(oauthPage, process.env.GOOGLE_ACCOUNT_EMAIL || "")) {
        console.log("[twitter-login] Google account selected");
        await oauthPage.waitForTimeout(3000).catch(() => undefined);
      }

      // Consent screen (may not appear; may be localized; page may be closed)
      if (!oauthPage.isClosed()) {
        await this.clickElementByText(oauthPage, [
          "Continue",
          "Allow",
          "চালিয়ে যান",
          "অনুমতি দিন"
        ]);
        await oauthPage.waitForTimeout(3000).catch(() => undefined);
      }

      // Wait for X to set the auth cookie
      const deadline = Date.now() + 45000;
      let authenticated = false;
      while (Date.now() < deadline) {
        const cookies = await context.cookies();
        if (cookies.some(c => c.name === "auth_token" && c.value.length > 0)) {
          authenticated = true;
          break;
        }
        await page.waitForTimeout(1500);
      }
      if (!authenticated) {
        throw new Error(`Google OAuth did not complete (last URLs: ${oauthPage.url()} / ${page.url()})`);
      }
      console.log("[twitter-login] auth_token acquired via Google OAuth — login successful");

      await page.goto(TWITTER_HOME, { waitUntil: "commit", timeout: 30000 }).catch(() => undefined);
      await page.waitForTimeout(3000);
      await this.persistState(context, true);
      logger.info("Twitter login via Google succeeded — new session saved.");
      return true;
    } catch (e: any) {
      logger.warn(`Google OAuth login failed: ${e.message}`);
      if (page) {
        try {
          const shotPath = path.join(
            path.dirname(this.getSessionPath()),
            headless ? "twitter-google-failure-headless.png" : "twitter-google-failure-headed.png"
          );
          await page.screenshot({ path: shotPath });
          logger.warn(`Google login failure screenshot: ${shotPath}`);
        } catch {
          // ignore screenshot errors
        }
      }
      return false;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  /**
   * Automated login via TWITTER_USERNAME / TWITTER_PASSWORD env vars.
   * Best-effort: if X throws an unexpected challenge / 2FA screen, it aborts
   * cleanly and the caller falls back to manual login.
   */
  public static async loginWithCredentials(headless = true): Promise<boolean> {
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    if (!username || !password) {
      return false;
    }

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      logger.info(
        `Attempting automated Twitter login with stored credentials (${headless ? "headless" : "headed"}, humanized)...`
      );

      // Persistent profile: a browser with accumulated state/history scores
      // far better with X's behavioral bot checks than a fresh context.
      context = await this.launchProfileContext(headless);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined
        });
      });
      page = await context.newPage();

      // Playwright's isVisible() can disagree with the DOM on X's animated
      // login sheets (clipped/zero-box elements), so resolve buttons by exact
      // text at the DOM level and click them with a REAL mouse event at their
      // coordinates — bypassing actionability checks entirely.
      const clickButtonByText = async (texts: string[]): Promise<boolean> => {
        const box = await page!
          .evaluate(
            (txts: string[]) => {
              const btns = Array.from(document.querySelectorAll("button"));
              for (const b of btns) {
                const t = (b.textContent || "").trim();
                if (txts.includes(t) && (b.offsetParent || b.getClientRects().length)) {
                  const r = b.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0) {
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                  }
                }
              }
              return null;
            },
            texts
          )
          .catch(() => null);
        if (box) {
          console.log(`[twitter-login] mouse-clicking button "${texts.join("/")}" at (${Math.round(box.x)}, ${Math.round(box.y)})`);
          await this.humanMouseMoveClick(page!, box.x, box.y);
          return true;
        }
        return false;
      };

      const hasAuthToken = async (): Promise<boolean> => {
        const cookies = await context!.cookies();
        return cookies.some(c => c.name === "auth_token" && c.value.length > 0);
      };

      // Entry via the plain homepage: the dedicated /i/flow/login URL is the
      // most aggressively bot-protected endpoint, while the homepage's
      // Sign-in modal is a tamer entry point.
      await page.goto("https://x.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);

      // Open the login form if the homepage doesn't show it directly
      const usernameProbe = async (): Promise<boolean> => {
        for (const sel of [
          'input[name="username_or_email"]',
          'input[autocomplete^="username"]',
          'input[name="text"]'
        ]) {
          const loc = page!.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            return true;
          }
        }
        return false;
      };
      if (!(await usernameProbe())) {
        console.log("[twitter-login] homepage loaded — opening the Sign in modal");
        await clickButtonByText(["Sign in"]);
        await page.waitForTimeout(3000);
      }

      // Diagnostic: dump every input on the login page so selector issues
      // are visible in the logs (console.log bypasses the winston info filter)
      try {
        const inputsInfo = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input")).map(i => ({
            kind: "input",
            type: i.type,
            name: i.name || "",
            autocomplete: i.autocomplete || "",
            placeholder: i.placeholder || "",
            readOnly: i.readOnly,
            disabled: i.disabled,
            visible: !!(i.offsetParent || i.getClientRects().length)
          }));
          const buttons = Array.from(document.querySelectorAll("button, [role='button']")).map(b => ({
            kind: "button",
            tag: b.tagName.toLowerCase(),
            testid: (b as HTMLElement).dataset ? (b as HTMLElement).dataset.testid || "" : "",
            role: b.getAttribute("role") || "",
            text: (b.textContent || "").trim().slice(0, 40),
            disabled: (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true",
            visible: !!(b as HTMLElement).offsetParent || !!(b as HTMLElement).getClientRects().length
          }));
          return { inputs, buttons };
        });
        console.log(
          `[twitter-login] page state — inputs: ${JSON.stringify(inputsInfo.inputs)}`
        );
        console.log(
          `[twitter-login] page state — buttons: ${JSON.stringify(inputsInfo.buttons)}`
        );
      } catch (e: any) {
        console.log("[twitter-login] input diagnostics failed:", e.message);
      }

      // Step 1: username
      // X serves multiple login-flow variants (old "Next" flow and the newer
      // "Email or username" + "Continue" flow) — probe visible inputs, type
      // with real keystrokes, and verify the text landed before continuing.
      logger.info("Login step 1/4: entering username...");
      const usernameSelectors = [
        'input[name="username_or_email"]',
        'input[autocomplete^="username"]',
        'input[placeholder*="email or username" i]',
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[name="username"]'
      ];
      const continueButton = page
        .locator('[data-testid="nextButton"], button:text-is("Continue"), button:text-is("Next")')
        .first();

      let typed = false;
      const inputDeadline = Date.now() + 30000;
      while (Date.now() < inputDeadline && !typed) {
        for (const sel of usernameSelectors) {
          const loc = page.locator(sel).first();
          if (!(await loc.isVisible().catch(() => false))) {
            continue;
          }
          console.log(`[twitter-login] typing username into input matched by: ${sel}`);
          try {
            await this.humanType(loc, username);
          } catch (e: any) {
            console.log(`[twitter-login] humanType failed on ${sel}: ${e.message}`);
          }
          let val = await loc.inputValue().catch(() => "");
          if (!val.includes(username)) {
            // Fallback: type into whatever actually has focus
            console.log(`[twitter-login] value not set (${val.length} chars), retrying via page.keyboard`);
            try {
              await page.keyboard.type(username, { delay: 60 });
            } catch (e: any) {
              console.log(`[twitter-login] keyboard.type failed: ${e.message}`);
            }
            val = await loc.inputValue().catch(() => "");
            if (!val.includes(username)) {
              const active = await page
                .evaluate(() => {
                  const el = document.activeElement as HTMLInputElement | null;
                  return el && el.tagName === "INPUT"
                    ? { placeholder: el.placeholder, valueLen: (el.value || "").length }
                    : null;
                })
                .catch(() => null);
              console.log(
                `[twitter-login] still not set after keyboard fallback (val=${val.length} chars), activeElement:`,
                JSON.stringify(active)
              );
            }
          }
          if (val.includes(username)) {
            typed = true;
            break;
          }
          // wrong input (text didn't land) — clear it and keep probing
          await loc.fill("").catch(() => undefined);
        }
        if (!typed) {
          await page.waitForTimeout(500);
        }
      }
      if (!typed) {
        throw new Error("could not type the username into any visible login input");
      }
      await page.waitForTimeout(500);
      // Diagnostic: post-typing state (buttons + password visibility)
      try {
        const postState = await page.evaluate(() => ({
          buttons: Array.from(document.querySelectorAll("button, [role='button']"))
            .filter(b => !!(b as HTMLElement).offsetParent || !!(b as HTMLElement).getClientRects().length)
            .map(b => ({
              tag: b.tagName.toLowerCase(),
              testid: (b as HTMLElement).dataset ? (b as HTMLElement).dataset.testid || "" : "",
              text: (b.textContent || "").trim().slice(0, 40),
              disabled:
                (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true"
            })),
          passwordVisible: Array.from(document.querySelectorAll("input[type='password']")).some(
            i => !!(i as HTMLElement).offsetParent || !!(i as HTMLElement).getClientRects().length
          )
        }));
        console.log(
          `[twitter-login] after typing — password visible: ${postState.passwordVisible}, buttons: ${JSON.stringify(postState.buttons)}`
        );
      } catch {
        // ignore diagnostics errors
      }
      // X renders the login sheet twice in the DOM; after typing, the second
      // copy is the live one — always resolve the first *visible* match
      // instead of trusting DOM order.
      const firstVisible = async (selector: string) => {
        const loc = page!.locator(selector);
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const nth = loc.nth(i);
          if (await nth.isVisible().catch(() => false)) {
            return nth;
          }
        }
        return null;
      };

      // Same as firstVisible, but scoped inside a parent locator (e.g. a form)
      const firstVisibleIn = async (parent: ReturnType<Page["locator"]>, selector: string) => {
        const loc = parent.locator(selector);
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const nth = loc.nth(i);
          if (await nth.isVisible().catch(() => false)) {
            return nth;
          }
        }
        return null;
      };

      // Wait for the UI to settle after typing, then detect the flow variant
      await page.waitForTimeout(1500);

      // Password input resolver: prefer a visible input whose <form> has a
      // submit button (the inert sheet copy's form has none)
      const findPasswordInput = async (): Promise<Locator | null> => {
        const pwCandidates = page!.locator('input[type="password"]');
        const n = await pwCandidates.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const cand = pwCandidates.nth(i);
          if (!(await cand.isVisible().catch(() => false))) {
            continue;
          }
          const form = cand.locator("xpath=ancestor::form[1]");
          if (await form.locator('button[type="submit"]').count().catch(() => 0)) {
            return cand;
          }
        }
        return null;
      };

      const typePassword = async (pwInput: Locator) => {
        await this.humanType(pwInput, password);
        const val = await pwInput.inputValue().catch(() => "");
        if (!val) {
          await pwInput.fill(password);
        }
        console.log("[twitter-login] password entered");
      };

      const nextBtnSelector =
        '[data-testid="nextButton"], button:text-is("Continue"), button:text-is("Next")';

      let passwordInput = await findPasswordInput();
      const consolidated = !!passwordInput;
      if (consolidated) {
        // Consolidated form: username AND password on one screen — the
        // password MUST be typed before clicking Continue, otherwise the
        // form submits with an empty password and silently resets.
        console.log("[twitter-login] consolidated form detected — typing password before submit");
        await typePassword(passwordInput!);
      } else {
        // Two-step flow: advance past the username step, then wait for the
        // password field
        console.log("[twitter-login] two-step flow — advancing to the password step");
        if (!(await clickButtonByText(["Continue", "Next"]))) {
          const fallbackBtn = await firstVisible(nextBtnSelector);
          if (fallbackBtn) {
            await fallbackBtn.click();
          }
        }
        const pwDeadline = Date.now() + 30000;
        while (Date.now() < pwDeadline && !passwordInput) {
          passwordInput = await findPasswordInput();
          if (!passwordInput) {
            await page.waitForTimeout(500);
          }
        }
        if (!passwordInput) {
          // "Unusual login activity" — verify identity by re-entering the username
          const verifyInput = await firstVisible('input[data-testid="ocfEnterTextTextInput"]');
          if (verifyInput) {
            console.log("[twitter-login] handling username verification step");
            await verifyInput.fill(username);
            await clickButtonByText(["Next", "Continue"]);
            const pwDeadline2 = Date.now() + 30000;
            while (Date.now() < pwDeadline2 && !passwordInput) {
              passwordInput = await findPasswordInput();
              if (!passwordInput) {
                await page.waitForTimeout(500);
              }
            }
          }
        }
        if (!passwordInput) {
          throw new Error("no usable password field appeared after the username step");
        }
        await typePassword(passwordInput);
      }

      // Submit: real mouse click on the form's Continue/Log in button, with
      // an Enter-keypress fallback
      if (await clickButtonByText(["Log in", "Continue"])) {
        await page.waitForTimeout(4000);
      }
      if (!(await hasAuthToken())) {
        console.log("[twitter-login] button click didn't authenticate; pressing Enter in the password field");
        await passwordInput!.press("Enter");
        await page.waitForTimeout(4000);
      }
      if (!(await hasAuthToken())) {
        // Last resort: click the submit button inside the SAME form as the
        // password field via Playwright
        const form = passwordInput!.locator("xpath=ancestor::form[1]");
        const submitBtn =
          (await firstVisibleIn(form, 'button[type="submit"]')) ||
          (await firstVisibleIn(form, 'button:text-is("Log in"), button:text-is("Continue")'));
        if (submitBtn) {
          console.log("[twitter-login] trying form-scoped submit click");
          await submitBtn.click({ force: true }).catch(() => undefined);
          await page.waitForTimeout(4000);
        }
      }

      // Step 4: wait for authentication. New devices often land on an
      // onboarding interstitial instead of /home, and the auth cookie can
      // lag behind — poll for it, and try landing on /home to force it.
      logger.info("Login step 4/4: waiting for authentication (auth_token cookie)...");
      const loginDeadline = Date.now() + 45000;
      let authenticated = false;
      let triedHome = false;
      while (Date.now() < loginDeadline) {
        const cookies = await context.cookies();
        if (cookies.some(c => c.name === "auth_token" && c.value.length > 0)) {
          authenticated = true;
          break;
        }
        if (await firstVisible('input[data-testid="ocfEnterTextTextInput"]')) {
          throw new Error("2FA / challenge screen detected — automated login not possible without TOTP secret");
        }
        // After ~10s without the cookie, try forcing the issue: navigate to
        // the home feed — an authenticated context loads it and sets cookies
        if (!triedHome && Date.now() > loginDeadline - 35000) {
          triedHome = true;
          console.log("[twitter-login] no auth_token yet; navigating to /home to force cookie issuance");
          await page.goto(TWITTER_HOME, { waitUntil: "commit", timeout: 30000 }).catch(() => undefined);
        }
        await page.waitForTimeout(1000);
      }
      if (!authenticated) {
        const cookieNames = (await context.cookies()).map(c => c.name).join(", ");
        throw new Error(
          `login did not authenticate (URL: ${page.url()}, cookies: ${cookieNames || "none"})`
        );
      }
      console.log("[twitter-login] auth_token acquired — login successful");

      // Land on the home feed once so the context picks up final cookies
      await page.goto(TWITTER_HOME, { waitUntil: "commit", timeout: 30000 }).catch(() => undefined);
      await page.waitForTimeout(3000);

      await this.persistState(context, true);
      logger.info("Automated Twitter login succeeded — new session saved.");
      return true;
    } catch (e: any) {
      logger.warn(`Automated Twitter login failed (${headless ? "headless" : "headed"}): ${e.message}`);
      if (page) {
        try {
          const shotPath = path.join(
            path.dirname(this.getSessionPath()),
            headless ? "twitter-login-failure-headless.png" : "twitter-login-failure-headed.png"
          );
          await page.screenshot({ path: shotPath });
          logger.warn(`Login failure screenshot saved to: ${shotPath}`);
        } catch {
          // ignore screenshot errors
        }
      }
      return false;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  /**
   * Open a headed browser for manual login. Polls the page until the user
   * completes login (or timeout), then saves the session.
   */
  public static async manualLogin(timeoutMs: number = 5 * 60 * 1000): Promise<boolean> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      logger.warn("Opening browser window for manual Twitter login...");
      browser = await chromium.launch({ headless: false, args: ANTI_BOT_ARGS });
      context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 1024 }
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined
        });
      });
      const page = await context.newPage();
      await page.goto(TWITTER_LOGIN, { waitUntil: "commit", timeout: 30000 });

      const message =
        "ACTION REQUIRED: log in to X in the opened browser window. " +
        `Waiting up to ${Math.round(timeoutMs / 60000)} minutes...`;
      logger.warn(message);
      console.log(`\n👉 ${message}\n`);

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const url = page.url();
        if (url.includes("/home") && !(await this.detectLoginWall(page))) {
          await this.persistState(context, true);
          logger.info("Manual Twitter login complete — new session saved.");
          return true;
        }
        await page.waitForTimeout(2000);
      }
      logger.error("Manual Twitter login timed out.");
      return false;
    } catch (e: any) {
      logger.error(`Manual Twitter login failed: ${e.message}`);
      return false;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Ensure a valid Twitter session exists, refreshing it dynamically when
   * expired: validate -> credential login -> headed manual login fallback.
   * Cooldown-guarded so the cron pipeline can call this every cycle safely.
   */
  public static async ensureSession(): Promise<boolean> {
    const status = await this.validateSession();
    if (status === "valid") {
      return true;
    }
    return this.attemptRefresh(status);
  }

  /**
   * Force a session refresh regardless of current state (used by the
   * `npm run twitter:refresh` script; no cooldown).
   */
  public static async refresh(): Promise<boolean> {
    if (this.refreshInProgress) {
      logger.warn("Twitter session refresh already in progress.");
      return false;
    }
    this.refreshInProgress = true;
    try {
      // Google OAuth first — proven to pass X's bot wall (the profile is
      // pre-authorized via twitter:google-setup)
      if (await this.loginWithGoogle(true)) {
        return true;
      }
      if (this.canDoManualLogin() && await this.loginWithGoogle(false)) {
        return true;
      }
      // Credential login (currently blocked by X's Arkose wall, kept in case
      // it relaxes) — headless, then a visible-browser retry
      if (process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD) {
        if (await this.loginWithCredentials(true)) {
          return true;
        }
        if (this.canDoManualLogin() && await this.loginWithCredentials(false)) {
          return true;
        }
      }
      if (this.canDoManualLogin()) {
        if (await this.manualLogin(10 * 60 * 1000)) {
          return true;
        }
      } else {
        logger.error(
          "No desktop display available for manual login. " +
            "Set TWITTER_USERNAME / TWITTER_PASSWORD in .env to enable automated re-login."
        );
      }
      logger.error(
        'TWITTER_SESSION_EXPIRED: unable to renew the Twitter session. Run "npm run twitter:refresh" on a machine with a display to fix.'
      );
      return false;
    } finally {
      this.refreshInProgress = false;
    }
  }

  private static async attemptRefresh(reason: SessionStatus | string): Promise<boolean> {
    const now = Date.now();
    if (this.refreshInProgress) {
      logger.warn("Twitter session refresh already in progress; skipping concurrent attempt.");
      return false;
    }
    if (now - this.lastRefreshAttempt < this.REFRESH_COOLDOWN_MS) {
      const waitS = Math.ceil((this.REFRESH_COOLDOWN_MS - (now - this.lastRefreshAttempt)) / 1000);
      logger.warn(
        `Twitter session refresh on cooldown (reason: ${reason}); next attempt in ~${waitS}s. ` +
          'Run "npm run twitter:refresh" to force a refresh now.'
      );
      return false;
    }

    this.refreshInProgress = true;
    this.lastRefreshAttempt = now;
    try {
      // Google OAuth first — proven to pass X's bot wall (the profile is
      // pre-authorized via twitter:google-setup)
      if (await this.loginWithGoogle(true)) {
        return true;
      }
      if (this.canDoManualLogin() && await this.loginWithGoogle(false)) {
        return true;
      }
      // Credential login (currently blocked by X's Arkose wall, kept in case
      // it relaxes) — headless, then a visible-browser retry
      if (process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD) {
        if (await this.loginWithCredentials(true)) {
          return true;
        }
        if (this.canDoManualLogin() && await this.loginWithCredentials(false)) {
          return true;
        }
      }
      if (this.canDoManualLogin()) {
        // Auto-triggered popup: shorter timeout so the cron pipeline isn't
        // blocked forever if nobody is at the desktop
        if (await this.manualLogin(5 * 60 * 1000)) {
          return true;
        }
      }
      logger.error(
        `TWITTER_SESSION_EXPIRED: session is ${reason} and could not be renewed automatically. ` +
          'Run "npm run twitter:refresh" to fix manually.'
      );
      return false;
    } finally {
      this.refreshInProgress = false;
    }
  }
}
