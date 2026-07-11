export const REDDIT_SUBREDDITS: string[] = [
  "https://www.reddit.com/r/programmerhumor/",
  "https://www.reddit.com/r/Sarcasm/",
  "https://www.reddit.com/r/nottheonion/",
  "https://www.reddit.com/r/technicallythetruth/",
  "https://www.reddit.com/r/dankmemes/",
  "https://www.reddit.com/r/softwaregore/",
  "https://www.reddit.com/r/trolling/",
  "https://www.reddit.com/r/notinteresting/",
  "https://www.reddit.com/r/thomastheplankengine/"
];

/**
 * Extracts the subreddit name from a subreddit URL or returns it directly if it's already a name.
 */
export function getSubredditName(urlOrName: string): string {
  const clean = urlOrName.trim();
  if (clean.toLowerCase().includes("reddit.com/r/")) {
    const match = clean.match(/reddit\.com\/r\/([^/]+)/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return clean;
}
