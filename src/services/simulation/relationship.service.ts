// src/services/simulation/relationship.service.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

export class RelationshipService {
  /**
   * Fetch current relationship stage or initialize as 'UNKNOWN'
   */
  static async getOrCreateRelationship(humanId: string, personaId: string): Promise<any> {
    try {
      const { data: relationship, error } = await supabaseAdmin!
        .from("relationship_stages")
        .select("*")
        .eq("human_id", humanId)
        .eq("persona_id", personaId)
        .maybeSingle();

      if (error) throw error;

      if (!relationship) {
        const { data: newRel, error: insertError } = await supabaseAdmin!
          .from("relationship_stages")
          .insert({
            human_id: humanId,
            persona_id: personaId,
            stage: "UNKNOWN",
            interactions_count: 0
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newRel;
      }

      return relationship;
    } catch (err: any) {
      logger.error(`Error in getOrCreateRelationship for human ${humanId} and persona ${personaId}: ${err.message}`);
      return { stage: "UNKNOWN", interactions_count: 0 };
    }
  }

  /**
   * Set stage directly (e.g. to NEW_FRIEND when friendship is accepted)
   */
  static async updateStage(humanId: string, personaId: string, stage: string): Promise<void> {
    try {
      await this.getOrCreateRelationship(humanId, personaId);
      const { error } = await supabaseAdmin!
        .from("relationship_stages")
        .update({
          stage,
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("human_id", humanId)
        .eq("persona_id", personaId);

      if (error) throw error;
      logger.info(`Relationship stage advanced to ${stage} for human ${humanId} and persona ${personaId}`);
    } catch (err: any) {
      logger.error(`Error in updateStage: ${err.message}`);
    }
  }

  /**
   * Advance relationship by incrementing interaction count and advancing stage if threshold hit
   */
  static async advance(humanId: string, personaId: string, increment = 1): Promise<void> {
    try {
      const rel = await this.getOrCreateRelationship(humanId, personaId);
      const newCount = (rel.interactions_count || 0) + increment;
      let newStage = rel.stage;

      // Stage Progression Rules
      if (rel.stage === "UNKNOWN") {
        newStage = "NEW_FRIEND";
      } else if (newCount >= 40) {
        newStage = "FRIEND";
      } else if (newCount >= 15) {
        newStage = "CASUAL";
      } else if (newCount >= 5) {
        newStage = "ACQUAINTANCE";
      }

      const { error } = await supabaseAdmin!
        .from("relationship_stages")
        .update({
          stage: newStage,
          interactions_count: newCount,
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("human_id", humanId)
        .eq("persona_id", personaId);

      if (error) throw error;
      if (newStage !== rel.stage) {
        logger.info(`Relationship advanced: human ${humanId} ↔ persona ${personaId} progressed to ${newStage} (count: ${newCount})`);
      }
    } catch (err: any) {
      logger.error(`Error in advance relationship: ${err.message}`);
    }
  }
}
