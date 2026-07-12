import { ScraperService } from "../services/simulation/scraper.service";

async function run() {
  console.log("=== Testing Twitter Video Scraper Interception ===");
  // NASA frequently posts video tweets
  const tweets = await ScraperService.scrapeTwitterProfile("NASA", 5);
  console.log(`Scraped ${tweets.length} tweets from @NASA.`);
  
  for (const tweet of tweets) {
    console.log(`\n----------------------------------------`);
    console.log(`Author: ${tweet.author}`);
    console.log(`Text: "${tweet.body.substring(0, 80)}..."`);
    console.log(`Media Type: ${tweet.mediaType}`);
    console.log(`Image URL: ${tweet.imageUrl}`);
    console.log(`Video URL: ${tweet.videoUrl}`);
  }
}

run();
