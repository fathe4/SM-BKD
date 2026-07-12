import { logger } from "../src/utils/logger";

const args = process.argv.slice(2);
const chatId = args[0];
const mode = args[1] || "pause"; // "pause" or "resume"
const reason = args[2] || "DAILY_LIMIT";

if (!chatId) {
  console.log("Usage: npx ts-node scratch/triggerPause.ts <chatId> [pause/resume] [DAILY_LIMIT/SLEEP/BUSY/WORK/SOCIAL_FATIGUE]");
  process.exit(1);
}

async function main() {
  const port = process.env.PORT || 5000;
  const url = `http://localhost:${port}/api/v1/test/chat-availability`;

  logger.info(`Sending toggle request to running server at ${url}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatId,
        mode,
        reason
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Server failed to update availability: ${response.status} - ${errText}`);
      process.exit(1);
    }

    const data = await response.json();
    logger.info(`Successfully updated chat availability via running server! Status: ${JSON.stringify(data)}`);
  } catch (err: any) {
    logger.error(`Network error connecting to running backend server: ${err.message}`);
    logger.warn("Make sure the backend server (npm run dev) is running!");
    process.exit(1);
  }
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
});
