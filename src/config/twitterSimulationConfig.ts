export interface TwitterScraperConfig {
  mode: "feed" | "profiles" | "search";
  twitterUsernames?: string[]; // Used when mode === "profiles"
  searchTopic?: string;        // Used when mode === "search"
}

export const TWITTER_PERSONA_CONFIGS: Record<string, TwitterScraperConfig> = {
  "lily_davis_805": {
    mode: "profiles",
    twitterUsernames: ["Can_TheOnee", "linadreaamy", "YashRMFC", "elonmusk", "levelsio"]
  },
  "benjamin_clark_491": {
    mode: "feed"
  },
  "nolan_brown_611": {
    mode: "search",
    searchTopic: "AI breaking news"
  }
};
