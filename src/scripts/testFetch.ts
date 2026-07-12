import axios from "axios";
import Parser from "rss-parser";

const parser = new Parser();

const FEED_MAP = {
  "technology": [
    "https://techcrunch.com/feed/",
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"
  ],
  "design": [
    "https://www.smashingmagazine.com/feed/",
    "https://uxdesign.cc/feed"
  ],
  "marketing": [
    "https://blog.hubspot.com/marketing/rss.xml",
    "https://feedpress.me/mozblog"
  ]
};

async function run() {
  for (const [category, urls] of Object.entries(FEED_MAP)) {
    for (const url of urls) {
      console.log(`--- Fetching ${category}: ${url} ---`);
      try {
        const res = await axios.get(url, { timeout: 5000 });
        console.log("Status:", res.status, "Length:", res.data.length);
        const feed = await parser.parseString(res.data);
        console.log("Success! Title:", feed.title, "Items:", feed.items.length);
      } catch (e: any) {
        console.error("FAILED:", e.message || e);
      }
    }
  }
}

run().then(() => process.exit(0));
