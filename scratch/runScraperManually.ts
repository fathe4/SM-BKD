import { ScraperService } from "../src/services/simulation/scraper.service";
import { IngestionService } from "../src/services/simulation/ingestion.service";
import { logger } from "../src/utils/logger";

async function main() {
  logger.info("Starting manual scraping and ingestion run...");

  try {
    // Twitter/X Playwright scraper (RSS & DEV.to are disabled)
    logger.info("Running Playwright Twitter Scraper Pipeline...");
    const twitterCount = await ScraperService.runScraperPipeline();
    logger.info(`Twitter scraper pipeline complete. Ingested count: ${twitterCount}`);

    logger.info("All scraping pipelines completed successfully!");
  } catch (err: any) {
    logger.error(`Error during manual scrape run: ${err.message}`);
  }
}

main()
  .then(() => {
    logger.info("Script finished.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Fatal script error: ${err.message}`);
    process.exit(1);
  });
