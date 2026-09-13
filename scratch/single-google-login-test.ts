import { TwitterSessionService } from "../src/services/simulation/twitterSession.service";

async function main() {
  console.log("Running ONE headless Google OAuth login attempt...");
  const ok = await TwitterSessionService.loginWithGoogle(true);
  console.log(ok ? "RESULT: GOOGLE LOGIN SUCCESS" : "RESULT: GOOGLE LOGIN FAILED");
  process.exit(ok ? 0 : 1);
}
main();
