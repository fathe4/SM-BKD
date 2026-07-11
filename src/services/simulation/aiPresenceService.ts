import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { getIO } from "../../socketio";

export interface AiPresenceCache {
  userId: string;
  personaId: string;
  username: string;
  timezone: string;
  presenceState: "ONLINE" | "OFFLINE" | "SLEEPING" | "AWAY" | "BUSY";
  currentActivity: string;
  lastActive: Date;
}

export class AiPresenceService {
  private static cache = new Map<string, AiPresenceCache>(); // Key: user_id
  private static schedulerInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize AI presence system and load caches
   */
  static async init(): Promise<void> {
    try {
      logger.info("Initializing AI Presence Service...");
      
      // Load all AI users and their persona states/identities
      const { data: personas, error } = await supabaseAdmin!
        .from("persona_identities")
        .select(`
          id,
          user_id,
          username,
          timezone,
          persona_states (
            presence_state,
            current_activity,
            last_online_at
          )
        `);

      if (error) {
        throw new Error(`Failed to fetch AI personas: ${error.message}`);
      }

      if (personas) {
        for (const p of personas) {
          const state = Array.isArray(p.persona_states) 
            ? p.persona_states[0] 
            : p.persona_states;

          this.cache.set(p.user_id, {
            userId: p.user_id,
            personaId: p.id,
            username: p.username,
            timezone: p.timezone || "UTC",
            presenceState: (state?.presence_state || "ONLINE") as any,
            currentActivity: state?.current_activity || "ONLINE",
            lastActive: state?.last_online_at ? new Date(state.last_online_at) : new Date()
          });
        }
      }

      logger.info(`AI Presence Service: loaded ${this.cache.size} personas into memory cache.`);

      // Run initial check
      await this.evaluatePresenceCycles();

      // Schedule periodic presence/activity cycle evaluation (every 5 minutes)
      this.schedulerInterval = setInterval(() => {
        this.evaluatePresenceCycles().catch(err => {
          logger.error(`Error in evaluatePresenceCycles: ${err.message}`);
        });
      }, 5 * 60 * 1000);

    } catch (err: any) {
      logger.error(`Error initializing AI Presence Service: ${err.message}`);
    }
  }

  /**
   * Check sleeping vs waking hours and other scheduled transitions
   */
  private static async evaluatePresenceCycles(): Promise<void> {
    const now = new Date();
    
    for (const [userId, cacheItem] of this.cache.entries()) {
      const localHour = this.getLocalHour(cacheItem.timezone);
      
      let nextPresence: "ONLINE" | "SLEEPING" | "OFFLINE" = "ONLINE";
      let nextActivity = "ONLINE";

      // Sleep rules: 11 PM to 7 AM local time
      if (localHour < 7 || localHour >= 23) {
        nextPresence = "SLEEPING";
        nextActivity = "SLEEPING";
      } else {
        nextPresence = "ONLINE";
        nextActivity = "ONLINE";
      }

      // If state changed, update database & cache, and broadcast
      if (cacheItem.presenceState !== nextPresence || cacheItem.currentActivity !== nextActivity) {
        await this.updateAiPresenceState(userId, nextPresence, nextActivity);
      }
    }
  }

  /**
   * Update AI presence status both in database, cache, and broadcast to sockets
   */
  public static async updateAiPresenceState(
    userId: string, 
    presenceState: "ONLINE" | "OFFLINE" | "SLEEPING" | "AWAY" | "BUSY", 
    currentActivity: string
  ): Promise<void> {
    const cacheItem = this.cache.get(userId);
    if (!cacheItem) return;

    cacheItem.presenceState = presenceState;
    cacheItem.currentActivity = currentActivity;
    cacheItem.lastActive = new Date();

    // 1. Update Database
    try {
      await supabaseAdmin!
        .from("persona_states")
        .update({
          presence_state: presenceState,
          current_activity: currentActivity,
          last_online_at: cacheItem.lastActive.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("persona_id", cacheItem.personaId);
    } catch (err: any) {
      logger.error(`Failed to update AI presence in DB for user ${userId}: ${err.message}`);
    }

    // 2. Broadcast socket event to clients
    try {
      const io = getIO();
      if (io) {
        const clientStatus = presenceState === "ONLINE" ? "online" : "offline";
        
        io.emit("user:status", {
          userId,
          status: clientStatus,
          lastActive: cacheItem.lastActive.toISOString(),
          presenceState,
          currentActivity
        });
      }
    } catch (err: any) {
      logger.debug(`Could not broadcast AI presence (Socket server not initialized or offline): ${err.message}`);
    }
  }

  /**
   * Check if a user ID belongs to an AI persona
   */
  public static isAiUser(userId: string): boolean {
    return this.cache.has(userId);
  }

  /**
   * Get persona identity ID for a user ID
   */
  public static getPersonaId(userId: string): string | null {
    const item = this.cache.get(userId);
    return item ? item.personaId : null;
  }

  /**
   * Get cached AI status mapped to the client presence model
   */
  public static getAiStatus(userId: string): {
    status: "online" | "offline" | "away";
    lastActive: Date;
    presenceState: string;
    currentActivity: string;
  } {
    const cacheItem = this.cache.get(userId);
    if (!cacheItem) {
      return {
        status: "offline",
        lastActive: new Date(0),
        presenceState: "OFFLINE",
        currentActivity: "OFFLINE"
      };
    }

    const mappedStatus = cacheItem.presenceState === "ONLINE" ? "online" : "offline";

    return {
      status: mappedStatus as any,
      lastActive: cacheItem.lastActive,
      presenceState: cacheItem.presenceState,
      currentActivity: cacheItem.currentActivity
    };
  }

  /**
   * Helper to resolve local hour in target timezone using Intl standard API
   */
  private static getLocalHour(timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      });
      return parseInt(formatter.format(new Date()), 10);
    } catch (err) {
      return new Date().getUTCHours();
    }
  }
}
