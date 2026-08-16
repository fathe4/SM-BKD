import { config } from "dotenv";
import { TwitterSessionService } from "../services/simulation/twitterSession.service";

config();

/**
 * Twitter/X session manager CLI.
 *
 *   npm run twitter:refresh       — validate the session; if dead, re-acquire it
 *                                   (credential login, Google OAuth, manual popup)
 *   npm run twitter:check         — validate only, report status
 *   npm run twitter:google-setup  — one-time manual Google sign-in saved into
 *                                   the browser profile (enables Google OAuth login)
 */
async function main() {
  const mode = process.argv[2] || "refresh";

  console.log("\n========================================================");
  console.log("🐦 Twitter/X Session Manager 🐦");
  console.log("========================================================\n");
  console.log(`Session file: ${TwitterSessionService.getSessionPath()}`);
  console.log(
    `Credential login: ${
      process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD ? "enabled" : "disabled (set TWITTER_USERNAME / TWITTER_PASSWORD in .env)"
    }\n`
  );

  if (mode === "google-setup") {
    const ok = await TwitterSessionService.googleSetup();
    if (ok) {
      console.log("\n✅ Google profile ready. Automated X logins can now use 'Continue with Google'.");
      process.exit(0);
    }
    console.log("\n❌ Google setup did not complete.");
    process.exit(1);
  }

  const status = await TwitterSessionService.validateSession();

  if (mode === "check") {
    if (status === "valid") {
      console.log("✅ Twitter session is VALID (rotated cookies were persisted).");
      process.exit(0);
    }
    console.log(`❌ Twitter session status: ${status}`);
    console.log("   Fix it with: npm run twitter:refresh");
    process.exit(1);
  }

  if (status === "valid") {
    console.log("✅ Twitter session is already valid. Nothing to do (cookies refreshed).");
    process.exit(0);
  }

  console.log(`⚠️ Session is "${status}". Refreshing (credential login → manual popup fallback)...`);
  const ok = await TwitterSessionService.refresh();
  if (ok) {
    console.log("\n✅ Twitter session refreshed successfully.");
    process.exit(0);
  }
  console.log("\n❌ Failed to refresh the Twitter session. Check the logs above.");
  process.exit(1);
}

main();
