// src/controllers/reactionController.ts
import { Request, Response } from "express";
import { ReactionService } from "../services/reactionService";
import { controllerHandler } from "../utils/controllerHandler";
import { AppError } from "../middlewares/errorHandler";
import { TargetType, ReactionType } from "../models/interaction.model";
import { UUID } from "crypto"; // Add this import

export class ReactionController {
  /**
   * Add a reaction to a post
   * @route POST /api/v1/posts/:postId/reactions
   */
  static addReaction = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID; // Cast to UUID
      const targetId = req.params.postId as UUID; // Cast to UUID
      const { reaction_type } = req.body as { reaction_type: ReactionType };

      const reaction = await ReactionService.createReaction({
        user_id: userId,
        target_id: targetId,
        target_type: TargetType.POST,
        reaction_type,
      });

      res.status(201).json({
        status: "success",
        data: {
          reaction,
        },
      });
    }
  );

  /**
   * Get all reactions for a post
   * @route GET /api/v1/posts/:postId/reactions
   */
  static getReactions = controllerHandler(
    async (req: Request, res: Response) => {
      const targetId = req.params.postId as UUID; // Cast to UUID
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const { reactions, total } = await ReactionService.getReactionsForTarget(
        targetId,
        TargetType.POST,
        page,
        limit
      );

      res.status(200).json({
        status: "success",
        data: {
          reactions,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  /**
   * Get reaction summary for a post
   * @route GET /api/v1/posts/:postId/reactions/summary
   */
  static getReactionSummary = controllerHandler(
    async (req: Request, res: Response) => {
      const targetId = req.params.postId as UUID; // Cast to UUID

      const summary = await ReactionService.getReactionSummary(
        targetId,
        TargetType.POST
      );

      res.status(200).json({
        status: "success",
        data: {
          summary,
        },
      });
    }
  );

  /**
   * Check if user has reacted to a post
   * @route GET /api/v1/posts/:postId/reactions/status
   */
  static getReactionStatus = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID; // Cast to UUID
      const targetId = req.params.postId as UUID; // Cast to UUID

      const reaction = await ReactionService.getUserReactionToTarget(
        userId,
        targetId,
        TargetType.POST
      );

      res.status(200).json({
        status: "success",
        data: {
          hasReacted: !!reaction,
          reaction: reaction || null,
        },
      });
    }
  );

  /**
   * Update a reaction to a post
   * @route PATCH /api/v1/posts/:postId/reactions
   */
  static updateReaction = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID; // Cast to UUID
      const targetId = req.params.postId as UUID; // Cast to UUID
      const { reaction_type } = req.body as { reaction_type: ReactionType };

      // First check if the user has already reacted
      const existingReaction = await ReactionService.getUserReactionToTarget(
        userId,
        targetId,
        TargetType.POST
      );

      if (!existingReaction) {
        throw new AppError("You haven't reacted to this post yet", 404);
      }

      // Update the reaction
      const reaction = await ReactionService.updateReaction(
        existingReaction.id,
        userId,
        reaction_type
      );

      res.status(200).json({
        status: "success",
        data: {
          reaction,
        },
      });
    }
  );

  /**
   * Delete a reaction to a post
   * @route DELETE /api/v1/posts/:postId/reactions
   */
  static deleteReaction = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID; // Cast to UUID
      const targetId = req.params.postId as UUID; // Cast to UUID

      await ReactionService.deleteUserReactionToTarget(
        userId,
        targetId,
        TargetType.POST
      );

      res.status(204).send();
    }
  );
}
