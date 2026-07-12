import { redisService } from "../redis.service";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { UUID } from "crypto";

export class AiChatRegistryService {
  private static SLOTS_KEY = "ai:active_chatting_slots";
  private static ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static MAX_ACTIVE_PERSONAS = 10;

  /**
   * Tries to claim a chatting slot for an AI persona.
   * If they already have a slot, updates their activity timestamp.
   * If not, checks if a slot is available (max 10) and claims it.
   */
  static async acquireChatSlot(personaId: string): Promise<boolean> {
    if (!redisService.isReady()) {
      logger.warn("Redis is not ready, bypassing active chat slot cap.");
      return true;
    }

    const redis = redisService.getClient();
    const now = Date.now();
    const cutoff = now - this.ACTIVE_WINDOW_MS;

    // 1. Remove expired personas who haven't chatted in 24 hours
    await redis.zremrangebyscore(this.SLOTS_KEY, 0, cutoff);

    // 2. Check if this persona already has a slot
    const score = await redis.zscore(this.SLOTS_KEY, personaId);

    if (score !== null) {
      // Persona already in slot, update activity timestamp
      await redis.zadd(this.SLOTS_KEY, now.toString(), personaId);
      return true;
    }

    // 3. Check number of active slots occupied
    const count = await redis.zcard(this.SLOTS_KEY);

    if (count < this.MAX_ACTIVE_PERSONAS) {
      // Slot available, add persona
      await redis.zadd(this.SLOTS_KEY, now.toString(), personaId);
      logger.info(`AI Persona ${personaId} acquired an active chat slot. Current active slots: ${count + 1}`);
      return true;
    }

    // Slots are full!
    logger.warn(`AI Persona ${personaId} denied active chat slot. Active limit (${this.MAX_ACTIVE_PERSONAS}) reached.`);
    return false;
  }

  /**
   * Gets or initializes the daily message limit and count for a chat session.
   * Format of key: ai:chat:limit:<chatId>
   * Structure: { limit: number, count: number }
   */
  static async checkDailyMessageLimit(chatId: string): Promise<{ allowed: boolean; count: number; limit: number }> {
    if (!redisService.isReady()) {
      return { allowed: true, count: 0, limit: 25 };
    }

    const redis = redisService.getClient();
    const key = `ai:chat:limit:${chatId}`;
    const data = await redis.get(key);

    let sessionData = data ? JSON.parse(data) : null;

    if (!sessionData) {
      // Roll a random message limit between 5 and 25
      const limit = Math.floor(Math.random() * 21) + 5;
      sessionData = { limit, count: 0 };
      // Expire in 24 hours
      await redis.setex(key, 24 * 3600, JSON.stringify(sessionData));
    }

    if (sessionData.count >= sessionData.limit) {
      return { allowed: false, count: sessionData.count, limit: sessionData.limit };
    }

    return { allowed: true, count: sessionData.count, limit: sessionData.limit };
  }

  /**
   * Increments the daily message count for a chat session.
   */
  static async incrementMessageCount(chatId: string): Promise<void> {
    if (!redisService.isReady()) return;

    const redis = redisService.getClient();
    const key = `ai:chat:limit:${chatId}`;
    const data = await redis.get(key);

    if (data) {
      const sessionData = JSON.parse(data);
      sessionData.count += 1;
      await redis.setex(key, 24 * 3600, JSON.stringify(sessionData));
    }
  }

  /**
   * Determines the strategy to handle chat session limits when they are hit.
   * Returns one of: 'mute' | 'emoji' | 'hold' | 'goodbye'
   */
  static selectExitStrategy(): "mute" | "emoji" | "hold" | "goodbye" {
    const roll = Math.random();
    if (roll < 0.35) return "mute";       // Natural muting (leave on read)
    if (roll < 0.60) return "emoji";      // React with emoji only
    if (roll < 0.85) return "hold";       // One-liner holding phrase
    return "goodbye";                     // Standard natural goodbye
  }
}
