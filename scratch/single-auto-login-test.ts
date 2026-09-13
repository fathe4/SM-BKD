import { TwitterSessionService } from "../src/services/simulation/twitterSession.service";

async function main() {
  console.log("Running ONE headless credential login attempt...");
  const ok = await TwitterSessionService.loginWithCredentials(true);
  console.log(ok ? "RESULT: AUTO-LOGIN SUCCESS" : "RESULT: AUTO-LOGIN FAILED");
  process.exit(ok ? 0 : 1);
}
main();
