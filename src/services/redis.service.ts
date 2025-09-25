import Redis from "ioredis";
import { AppError } from "../middlewares/errorHandler";

// Feed-related types for better type safety
export interface CachedPost {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  [key: string]: any; // For flexibility with additional fields
}

export interface CachedFeedResult {
  posts: CachedPost[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface UserLocation {
  city: string | null;
  country: string | null;
  coordinates?: any;
}

// interface RedisConfig {
//   host: string;
//   port: number;
//   password?: string;
//   db?: number;
//   retryStrategy?: (times: number) => number | void;
// }

class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;

  // Cache TTL configurations (in seconds)
  private readonly TTL = {
    CHAT_SUMMARY: 300, // 5 minutes
    CHAT_LIST: 60, // 1 minute
    DIRECT_CHAT: 3600, // 1 hour
    UNREAD_COUNT: 30, // 30 seconds
    RECENT_MESSAGES: 120, // 2 minutes
    USER_PARTICIPANTS: 300, // 5 minutes

    // Feed system TTLs
    USER_FEED: 300, // 5 minutes (main feed cache)
    USER_LOCATION: 3600, // 1 hour (location doesn't change often)
    USER_FRIENDS: 1800, // 30 minutes (friends list)
    LOCATION_POSTS: 600, // 10 minutes (location posts change less frequently)
    BOOSTED_POSTS: 180, // 3 minutes (boosted posts need fresher data)
    POPULAR_POSTS: 900, // 15 minutes (popular posts change slowly)
    SEEN_BOOSTS: 86400, // 24 hours (deduplication tracking)
    FEED_ENGAGEMENT: 86400, // 24 hours (analytics)

    // User service TTLs
    USER_BASIC: 1800, // 30 minutes (basic user data)
    USER_MARKETPLACE: 900, // 15 minutes (marketplace stats)
    USER_SUBSCRIPTION: 1800, // 30 minutes (subscription details)
  };

  /**
   * Initialize Redis connection
   */
  initialize() {
    // if (this.client) {
    //   console.log("Redis client already initialized");
    //   return this.client;
    // }
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new AppError(
        "REDIS_URL is not defined in environment variables",
        400
      );
    }

    // const defaultConfig: RedisConfig = {
    //   host: process.env.REDIS_HOST || "localhost",
    //   port: parseInt(process.env.REDIS_PORT || "6379"),
    //   password: process.env.REDIS_PASSWORD,
    //   db: parseInt(process.env.REDIS_DB || "0"),
    //   retryStrategy: (times) => {
    //     const delay = Math.min(times * 50, 2000);
    //     return delay;
    //   },
    // };

    this.client = new Redis(redisUrl, {
      tls: {},
      retryStrategy: times => Math.min(times * 50, 2000),
    });

    this.client.on("connect", () => {
      console.log("✅ Redis connected successfully");
      this.isConnected = true;
    });

    this.client.on("error", err => {
      console.error("❌ Redis connection error:", err);
      this.isConnected = false;
    });

    this.client.on("close", () => {
      console.log("Redis connection closed");
      this.isConnected = false;
    });

    return this.client;
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis {
    if (!this.client) {
      throw new AppError("Redis client not initialized", 500);
    }
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get TTL values
   */
  getTTL() {
    return {
      CHAT_SUMMARY: 300, // 5 minutes
      CHAT_LIST: 60, // 1 minute
      DIRECT_CHAT: 3600, // 1 hour
      UNREAD_COUNT: 30, // 30 seconds
      RECENT_MESSAGES: 120, // 2 minutes
      USER_PARTICIPANTS: 300, // 5 minutes

      // Feed system TTLs
      USER_FEED: 300, // 5 minutes (main feed cache)
      USER_LOCATION: 3600, // 1 hour (location doesn't change often)
      USER_FRIENDS: 1800, // 30 minutes (friends list)
      LOCATION_POSTS: 600, // 10 minutes (location posts change less frequently)
      BOOSTED_POSTS: 180, // 3 minutes (boosted posts need fresher data)
      POPULAR_POSTS: 900, // 15 minutes (popular posts change slowly)
      SEEN_BOOSTS: 86400, // 24 hours (deduplication tracking)
      FEED_ENGAGEMENT: 86400, // 24 hours (analytics)

      // User service TTLs
      USER_BASIC: 1800, // 30 minutes (basic user data)
      USER_MARKETPLACE: 900, // 15 minutes (marketplace stats)
      USER_SUBSCRIPTION: 1800, // 30 minutes (subscription details)
    };
  }

  /**
   * Gracefully disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }

  // ============= CACHE KEY GENERATORS =============

  keys = {
    // Chat system keys
    chatList: (userId: string) => `chat:list:${userId}`,
    chatSummary: (chatId: string) => `chat:summary:${chatId}`,
    directChat: (userA: string, userB: string) => {
      // Sort user IDs to ensure consistent key regardless of order
      const [first, second] = [userA, userB].sort();
      return `chat:direct:${first}:${second}`;
    },
    unreadCount: (userId: string, chatId: string) =>
      `unread:${userId}:${chatId}`,
    recentMessages: (chatId: string) => `messages:recent:${chatId}`,
    chatParticipants: (chatId: string) => `chat:participants:${chatId}`,
    userChatsTotal: (userId: string) => `chat:total:${userId}`,

    // Feed system keys
    userFeed: (userId: string, page: number) => `feed:user:${userId}:${page}`,
    userLocation: (userId: string) => `location:${userId}`,
    userFriends: (userId: string) => `friends:${userId}`,

    // Boosted posts by location
    boostedPosts: (country: string) => `boosted:${country}`,
    globalBoostedPosts: () => "boosted:global",

    // Location-based posts
    locationPosts: (city: string, country: string, page: number) =>
      `posts:location:${city}:${country}:${page}`,

    // Friends posts
    friendsPosts: (userId: string, page: number) =>
      `posts:friends:${userId}:${page}`,

    // Popular posts fallback
    popularPosts: (page: number) => `posts:popular:${page}`,

    // Deduplication tracking
    userSeenBoosts: (userId: string) => `seen:boosts:${userId}`,

    // Analytics (optional)
    feedEngagement: (userId: string, date: string) =>
      `analytics:feed:${userId}:${date}`,

    // User service keys
    userBasic: (userId: string) => `user:basic:${userId}`,
    userMarketplace: (userId: string) => `user:marketplace:${userId}`,
    userSubscription: (userId: string) => `user:subscription:${userId}`,
  };

  // ============= GENERIC CACHE OPERATIONS =============

  /**
   * Get cached data with automatic JSON parsing
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady()) return null;

    try {
      const data = await this.client!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache with automatic JSON stringification
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const stringValue = JSON.stringify(value);
      if (ttl) {
        await this.client!.setex(key, ttl, stringValue);
      } else {
        await this.client!.set(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cache entries
   */
  async delete(...keys: string[]): Promise<number> {
    if (!this.isReady() || keys.length === 0) return 0;

    try {
      return await this.client!.del(...keys);
    } catch (error) {
      console.error("Redis DELETE error:", error);
      return 0;
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isReady()) return 0;

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client!.del(...keys);
    } catch (error) {
      console.error(`Redis DELETE pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  // ============= FEED-SPECIFIC CACHE OPERATIONS =============

  /**
   * Cache user's feed for a specific page
   */
  async setUserFeed(
    userId: string,
    page: number,
    feedResult: CachedFeedResult | CachedPost[]
  ): Promise<void> {
    const key = this.keys.userFeed(userId, page);
    await this.set(key, feedResult, this.TTL.USER_FEED);
  }

  /**
   * Get cached user feed for a specific page
   */
  async getUserFeed(
    userId: string,
    page: number
  ): Promise<CachedFeedResult | CachedPost[] | null> {
    const key = this.keys.userFeed(userId, page);
    return this.get<CachedFeedResult | CachedPost[]>(key);
  }

  /**
   * Cache user location data
   */
  async setUserLocation(userId: string, location: UserLocation): Promise<void> {
    const key = this.keys.userLocation(userId);
    await this.set(key, location, this.TTL.USER_LOCATION);
  }

  /**
   * Get cached user location
   */
  async getUserLocation(userId: string): Promise<UserLocation | null> {
    const key = this.keys.userLocation(userId);
    return this.get<UserLocation>(key);
  }

  /**
   * Cache user's friends list
   */
  async setUserFriends(userId: string, friendIds: string[]): Promise<void> {
    const key = this.keys.userFriends(userId);
    await this.set(key, friendIds, this.TTL.USER_FRIENDS);
  }

  /**
   * Get cached user friends list
   */
  async getUserFriends(userId: string): Promise<string[] | null> {
    const key = this.keys.userFriends(userId);
    return this.get<string[]>(key);
  }

  /**
   * Cache boosted posts for a specific location
   */
  async setBoostedPosts(country: string, posts: CachedPost[]): Promise<void> {
    const key = this.keys.boostedPosts(country);
    await this.set(key, posts, this.TTL.BOOSTED_POSTS);
  }

  /**
   * Get cached boosted posts for a location
   */
  async getBoostedPosts(country: string): Promise<CachedPost[] | null> {
    const key = this.keys.boostedPosts(country);
    return this.get<CachedPost[]>(key);
  }

  /**
   * Cache global boosted posts
   */
  async setGlobalBoostedPosts(posts: CachedPost[]): Promise<void> {
    const key = this.keys.globalBoostedPosts();
    await this.set(key, posts, this.TTL.BOOSTED_POSTS);
  }

  /**
   * Get cached global boosted posts
   */
  async getGlobalBoostedPosts(): Promise<CachedPost[] | null> {
    const key = this.keys.globalBoostedPosts();
    return this.get<CachedPost[]>(key);
  }

  /**
   * Add a boosted post to user's seen list (for deduplication)
   */
  async addSeenBoost(userId: string, postId: string): Promise<void> {
    const key = this.keys.userSeenBoosts(userId);
    const seenPosts = (await this.get<string[]>(key)) || [];

    if (!seenPosts.includes(postId)) {
      seenPosts.push(postId);
      // Keep only last 100 seen posts to prevent unlimited growth
      const limitedSeen = seenPosts.slice(-100);
      await this.set(key, limitedSeen, this.TTL.SEEN_BOOSTS);
    }
  }

  /**
   * Get list of boosted posts user has already seen
   */
  async getSeenBoosts(userId: string): Promise<string[]> {
    const key = this.keys.userSeenBoosts(userId);
    return (await this.get<string[]>(key)) || [];
  }

  /**
   * Cache location-based posts
   */
  async setLocationPosts(
    city: string,
    country: string,
    page: number,
    posts: CachedPost[]
  ): Promise<void> {
    const key = this.keys.locationPosts(city, country, page);
    await this.set(key, posts, this.TTL.LOCATION_POSTS);
  }

  /**
   * Get cached location-based posts
   */
  async getLocationPosts(
    city: string,
    country: string,
    page: number
  ): Promise<CachedPost[] | null> {
    const key = this.keys.locationPosts(city, country, page);
    return this.get<CachedPost[]>(key);
  }

  /**
   * Cache friends posts for a user
   */
  async setFriendsPosts(
    userId: string,
    page: number,
    posts: CachedPost[]
  ): Promise<void> {
    const key = this.keys.friendsPosts(userId, page);
    await this.set(key, posts, this.TTL.LOCATION_POSTS);
  }

  /**
   * Get cached friends posts
   */
  async getFriendsPosts(
    userId: string,
    page: number
  ): Promise<CachedPost[] | null> {
    const key = this.keys.friendsPosts(userId, page);
    return this.get<CachedPost[]>(key);
  }

  /**
   * Cache popular posts
   */
  async setPopularPosts(page: number, posts: CachedPost[]): Promise<void> {
    const key = this.keys.popularPosts(page);
    await this.set(key, posts, this.TTL.POPULAR_POSTS);
  }

  /**
   * Get cached popular posts
   */
  async getPopularPosts(page: number): Promise<CachedPost[] | null> {
    const key = this.keys.popularPosts(page);
    return this.get<CachedPost[]>(key);
  }

  /**
   * Invalidate all feed caches for a specific user
   */
  async invalidateUserFeed(userId: string): Promise<void> {
    await this.deletePattern(`feed:user:${userId}:*`);
    await this.deletePattern(`posts:friends:${userId}:*`);
  }

  /**
   * Invalidate location-based feed caches
   */
  async invalidateLocationFeeds(city: string, country: string): Promise<void> {
    await this.deletePattern(`posts:location:${city}:${country}:*`);
    await this.delete(this.keys.boostedPosts(country));
  }

  /**
   * Invalidate all boosted post caches
   */
  async invalidateBoostedPosts(): Promise<void> {
    await this.deletePattern("boosted:*");
  }

  /**
   * Invalidate popular posts cache
   */
  async invalidatePopularPosts(): Promise<void> {
    await this.deletePattern("posts:popular:*");
  }

  // ============= CHAT-SPECIFIC CACHE OPERATIONS =============

  /**
   * Cache user's chat list
   */
  async setChatList(
    userId: string,
    chats: any[],
    total: number
  ): Promise<void> {
    const key = this.keys.chatList(userId);
    const totalKey = this.keys.userChatsTotal(userId);

    await this.set(key, chats, this.TTL.CHAT_LIST);
    await this.set(totalKey, total, this.TTL.CHAT_LIST);
  }

  /**
   * Get cached chat list
   */
  async getChatList(
    userId: string
  ): Promise<{ chats: any[]; total: number } | null> {
    const key = this.keys.chatList(userId);
    const totalKey = this.keys.userChatsTotal(userId);

    const [chats, total] = await Promise.all([
      this.get<any[]>(key),
      this.get<number>(totalKey),
    ]);

    if (!chats || total === null) return null;
    return { chats, total };
  }

  /**
   * Cache chat summary
   */
  async setChatSummary(chatId: string, summary: any): Promise<void> {
    const key = this.keys.chatSummary(chatId);
    await this.set(key, summary, this.TTL.CHAT_SUMMARY);
  }

  /**
   * Get cached chat summary
   */
  async getChatSummary(chatId: string): Promise<any | null> {
    const key = this.keys.chatSummary(chatId);
    return this.get(key);
  }

  /**
   * Cache direct chat lookup
   */
  async setDirectChat(
    userA: string,
    userB: string,
    chatId: string | null
  ): Promise<void> {
    const key = this.keys.directChat(userA, userB);
    await this.set(key, chatId, this.TTL.DIRECT_CHAT);
  }

  /**
   * Get cached direct chat
   */
  async getDirectChat(userA: string, userB: string): Promise<string | null> {
    const key = this.keys.directChat(userA, userB);
    return this.get<string>(key);
  }

  /**
   * Update unread count (using Redis increment for atomicity)
   */
  async incrementUnread(userId: string, chatId: string): Promise<number> {
    if (!this.isReady()) return 0;

    const key = this.keys.unreadCount(userId, chatId);
    try {
      const count = await this.client!.incr(key);
      await this.client!.expire(key, this.TTL.UNREAD_COUNT);
      return count;
    } catch (error) {
      console.error("Redis INCR error:", error);
      return 0;
    }
  }

  /**
   * Reset unread count
   */
  async resetUnread(userId: string, chatId: string): Promise<void> {
    const key = this.keys.unreadCount(userId, chatId);
    await this.delete(key);
  }

  /**
   * Cache recent messages
   */
  async setRecentMessages(chatId: string, messages: any[]): Promise<void> {
    const key = this.keys.recentMessages(chatId);
    // Keep only last 50 messages
    const recentMessages = messages.slice(-50);
    await this.set(key, recentMessages, this.TTL.RECENT_MESSAGES);
  }

  /**
   * Get cached recent messages
   */
  async getRecentMessages(chatId: string): Promise<any[] | null> {
    const key = this.keys.recentMessages(chatId);
    return this.get<any[]>(key);
  }

  /**
   * Invalidate all caches for a user
   */
  async invalidateUserCaches(userId: string): Promise<void> {
    await this.deletePattern(`chat:list:${userId}*`);
    await this.deletePattern(`unread:${userId}:*`);
    await this.deletePattern(`chat:total:${userId}`);
  }

  /**
   * Invalidate all caches for a chat
   */
  async invalidateChatCaches(chatId: string): Promise<void> {
    await this.delete(
      this.keys.chatSummary(chatId),
      this.keys.recentMessages(chatId),
      this.keys.chatParticipants(chatId)
    );

    // Also invalidate chat lists for all participants
    // This requires getting participants first
    const participants = await this.get<string[]>(
      this.keys.chatParticipants(chatId)
    );
    if (participants) {
      await Promise.all(
        participants.map(userId => this.delete(this.keys.chatList(userId)))
      );
    }
  }

  /**
   * Cache chat participants (just user IDs for invalidation)
   */
  async setChatParticipants(chatId: string, userIds: string[]): Promise<void> {
    const key = this.keys.chatParticipants(chatId);
    await this.set(key, userIds, this.TTL.USER_PARTICIPANTS);
  }

  /**
   * Warm up cache for a user (preload common data)
   */
  async warmupUserCache(userId: string, chatService: any): Promise<void> {
    try {
      // This would be called after login or on-demand
      const chats = await chatService.getUserChats(userId, 1, 20);
      await this.setChatList(userId, chats.chats, chats.total);
    } catch (error) {
      console.error("Cache warmup failed:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    if (!this.isReady()) return null;

    try {
      const info = await this.client!.info("stats");
      const dbSize = await this.client!.dbsize();
      return {
        connected: this.isConnected,
        dbSize,
        info,
      };
    } catch (error) {
      console.error("Redis stats error:", error);
      return null;
    }
  }

  /**
   * Flush all cache (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (!this.isReady()) return;

    try {
      await this.client!.flushdb();
      console.log("Redis cache flushed");
    } catch (error) {
      console.error("Redis flush error:", error);
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();

// Export class for testing
export { RedisService };
