import Redis from "ioredis";
import { AppError } from "../middlewares/errorHandler";

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
      throw new AppError("REDIS_URL is not defined in environment variables", 400);
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
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on("connect", () => {
      console.log("✅ Redis connected successfully");
      this.isConnected = true;
    });

    this.client.on("error", (err) => {
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
        participants.map((userId) => this.delete(this.keys.chatList(userId)))
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
