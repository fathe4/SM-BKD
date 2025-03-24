// src/services/reactionService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import {
  Reaction,
  ReactionCreate,
  ReactionType,
  TargetType,
} from "../models/interaction.model";
import { UUID } from "crypto"; // Add this import

export interface ReactionSummary {
  like: number;
  love: number;
  haha: number;
  wow: number;
  sad: number;
  angry: number;
  total: number;
}

/**
 * Service class for reaction-related operations
 */
export class ReactionService {
  /**
   * Create a new reaction
   * If the user has already reacted, it will update the existing reaction
   */
  static createReaction = asyncHandler(
    async (reactionData: ReactionCreate): Promise<Reaction> => {
      // Check if the user has already reacted to this target
      const existingReaction = await this.getUserReactionToTarget(
        reactionData.user_id,
        reactionData.target_id,
        reactionData.target_type
      );

      if (existingReaction) {
        // If reaction exists with same type, return it
        if (existingReaction.reaction_type === reactionData.reaction_type) {
          return existingReaction;
        }

        // Otherwise update the existing reaction
        return await this.updateReaction(
          existingReaction.id,
          reactionData.user_id,
          reactionData.reaction_type
        );
      }

      // Create a new reaction
      const { data, error } = await supabaseAdmin!
        .from("reactions")
        .insert(reactionData)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Reaction;
    },
    "Failed to create reaction"
  );

  /**
   * Get all reactions for a target (post or comment)
   */
  static getReactionsForTarget = asyncHandler(
    async (
      targetId: UUID,
      targetType: TargetType,
      page = 1,
      limit = 50
    ): Promise<{ reactions: Reaction[]; total: number }> => {
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("reactions")
        .select("*, users!inner(username, profile_picture)", { count: "exact" })
        .eq("target_id", targetId)
        .eq("target_type", targetType)
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        reactions: data as unknown as Reaction[],
        total: count || 0,
      };
    },
    "Failed to get reactions for target"
  );

  /**
   * Get reaction summary for a target (post or comment)
   * Returns counts by reaction type
   */
  static getReactionSummary = asyncHandler(
    async (
      targetId: UUID,
      targetType: TargetType
    ): Promise<ReactionSummary> => {
      const { data, error } = await supabase
        .from("reactions")
        .select("reaction_type")
        .eq("target_id", targetId)
        .eq("target_type", targetType);

      if (error) {
        throw new AppError(error.message, 400);
      }

      // Initialize summary with zeros
      const summary: ReactionSummary = {
        like: 0,
        love: 0,
        haha: 0,
        wow: 0,
        sad: 0,
        angry: 0,
        total: 0,
      };

      // Count reactions by type
      data.forEach((reaction) => {
        const type = reaction.reaction_type as ReactionType;
        summary[type]++;
        summary.total++;
      });

      return summary;
    },
    "Failed to get reaction summary"
  );

  /**
   * Check if a user has reacted to a target
   * Returns the reaction if found, null otherwise
   */
  static getUserReactionToTarget = asyncHandler(
    async (
      userId: UUID,
      targetId: UUID,
      targetType: TargetType
    ): Promise<Reaction | null> => {
      const { data, error } = await supabase
        .from("reactions")
        .select("*")
        .eq("user_id", userId)
        .eq("target_id", targetId)
        .eq("target_type", targetType)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116") {
          // No results found
          return null;
        }
        throw new AppError(error.message, 400);
      }

      return data as Reaction | null;
    },
    "Failed to check user reaction"
  );

  /**
   * Update a reaction (change the type)
   */
  static updateReaction = asyncHandler(
    async (
      reactionId: UUID,
      userId: UUID,
      reactionType: ReactionType
    ): Promise<Reaction> => {
      // First check if the reaction exists and belongs to the user
      const { error: fetchError } = await supabase
        .from("reactions")
        .select("*")
        .eq("id", reactionId)
        .eq("user_id", userId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new AppError("Reaction not found", 404);
        }
        throw new AppError(fetchError.message, 400);
      }

      // Update the reaction
      const { data, error } = await supabaseAdmin!
        .from("reactions")
        .update({ reaction_type: reactionType })
        .eq("id", reactionId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Reaction;
    },
    "Failed to update reaction"
  );

  /**
   * Delete a user's reaction to a target
   */
  static deleteUserReactionToTarget = asyncHandler(
    async (
      userId: UUID,
      targetId: UUID,
      targetType: TargetType
    ): Promise<void> => {
      // Delete the reaction if it exists
      const { error } = await supabaseAdmin!
        .from("reactions")
        .delete()
        .eq("user_id", userId)
        .eq("target_id", targetId)
        .eq("target_type", targetType);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete user reaction"
  );
}
