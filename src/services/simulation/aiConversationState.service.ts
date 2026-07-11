import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { getIO } from "../../socketio";
import { getUserSocketIds } from "../../socketio/handlers/connectionHandler";
import { AiPresenceService } from "./aiPresenceService";
import { UUID } from "crypto";

export interface ConversationAvailability {
  state: "AVAILABLE" | "PAUSED" | "FINISHED";
  until: string | null;
  reason: "SLEEP" | "BUSY" | "SOCIAL_FATIGUE" | "WORK" | "NO_RESPONSE" | "DAILY_LIMIT" | null;
}

export class AiConversationStateService {
  /**
   * Check conversation availability for a chat ID
   */
  static async getAvailability(chatId: string): Promise<ConversationAvailability> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("ai_conversation_states")
        .select("state, until, reason")
        .eq("chat_id", chatId)
        .maybeSingle();

      if (error) {
        logger.error(`Error fetching conversation state for chat ${chatId}: ${error.message}`);
        return { state: "AVAILABLE", until: null, reason: null };
      }

      if (!data) {
        return { state: "AVAILABLE", until: null, reason: null };
      }

      const now = new Date();
      if (data.state === "PAUSED" && data.until && now > new Date(data.until)) {
        // Expired pause, clean up and set back to AVAILABLE
        await this.setAvailability(chatId, null, null, "AVAILABLE", "DAILY_LIMIT");
        return { state: "AVAILABLE", until: null, reason: null };
      }

      return {
        state: data.state as any,
        until: data.until,
        reason: data.reason as any
      };
    } catch (err: any) {
      logger.error(`Error in getAvailability: ${err.message}`);
      return { state: "AVAILABLE", until: null, reason: null };
    }
  }

  /**
   * Set conversation availability for a chat and broadcast the event
   */
  static async setAvailability(
    chatId: string,
    personaId: string | null,
    humanId: string | null,
    state: "AVAILABLE" | "PAUSED" | "FINISHED",
    reason: "SLEEP" | "BUSY" | "SOCIAL_FATIGUE" | "WORK" | "NO_RESPONSE" | "DAILY_LIMIT",
    until?: Date
  ): Promise<void> {
    try {
      // 1. Update Database
      if (state === "AVAILABLE") {
        await supabaseAdmin!
          .from("ai_conversation_states")
          .delete()
          .eq("chat_id", chatId);
      } else {
        if (!personaId || !humanId) {
          const { data: participants } = await supabaseAdmin!
            .from("chat_participants")
            .select("user_id")
            .eq("chat_id", chatId);

          if (participants) {
            for (const p of participants) {
              const uId = p.user_id;
              if (AiPresenceService.isAiUser(uId)) {
                personaId = AiPresenceService.getPersonaId(uId) || uId;
              } else {
                humanId = uId;
              }
            }
          }
        }

        if (personaId && humanId) {
          const { error } = await supabaseAdmin!
            .from("ai_conversation_states")
            .upsert({
              chat_id: chatId as UUID,
              persona_id: personaId as UUID,
              human_id: humanId as UUID,
              state,
              until: until ? until.toISOString() : null,
              reason,
              updated_at: new Date().toISOString()
            }, { onConflict: "chat_id" });

          if (error) {
            logger.error(`Failed to upsert to ai_conversation_states: ${error.message}`);
          }
        } else {
          logger.warn(`Could not resolve personaId or humanId for chat ${chatId}. Cannot set availability.`);
        }
      }

      // 2. Broadcast via Socket.IO to user devices
      const io = getIO();
      if (io) {
        if (!humanId) {
          const { data: participants } = await supabaseAdmin!
            .from("chat_participants")
            .select("user_id")
            .eq("chat_id", chatId);

          if (participants) {
            for (const p of participants) {
              if (!AiPresenceService.isAiUser(p.user_id)) {
                humanId = p.user_id;
                break;
              }
            }
          }
        }

        if (humanId) {
          const socketIds = getUserSocketIds(humanId);
          if (socketIds.length > 0) {
            socketIds.forEach(sid => {
              io.to(sid).emit("conversation:availability", {
                chatId,
                state,
                until: until ? until.toISOString() : null,
                reason
              });
            });
          }
        }
      }
    } catch (err: any) {
      logger.error(`Failed to set availability for chat ${chatId}: ${err.message}`);
    }
  }
}
