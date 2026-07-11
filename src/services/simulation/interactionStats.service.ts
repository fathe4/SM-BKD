// src/services/simulation/interactionStats.service.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

export class InteractionStatsService {
  /**
   * Get interaction stats for a human user
   */
  static async getStats(humanUserId: string): Promise<any | null> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("user_ai_interaction_stats")
        .select("*")
        .eq("human_user_id", humanUserId)
        .maybeSingle();

      if (error) {
        logger.error(`Error fetching interaction stats for human ${humanUserId}: ${error.message}`);
        return null;
      }
      return data;
    } catch (err: any) {
      logger.error(`Error in getStats: ${err.message}`);
      return null;
    }
  }

  /**
   * Record a new AI DM sent to a human user
   */
  static async recordDm(humanUserId: string, aiUserId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const stats = await this.getStats(humanUserId);

      if (!stats) {
        const { error } = await supabaseAdmin!
          .from("user_ai_interaction_stats")
          .insert({
            human_user_id: humanUserId,
            first_ai_dm_at: now,
            last_ai_dm_at: now,
            last_ai_greeting_at: now,
            total_ai_dms: 1,
            last_ai_sender_id: aiUserId
          });
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin!
          .from("user_ai_interaction_stats")
          .update({
            first_ai_dm_at: stats.first_ai_dm_at || now,
            last_ai_dm_at: now,
            last_ai_greeting_at: now,
            total_ai_dms: (stats.total_ai_dms || 0) + 1,
            last_ai_sender_id: aiUserId
          })
          .eq("human_user_id", humanUserId);
        if (error) throw error;
      }
    } catch (err: any) {
      logger.error(`Error in recordDm for human ${humanUserId} from AI ${aiUserId}: ${err.message}`);
    }
  }
}
