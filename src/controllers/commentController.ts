// src/controllers/commentController.ts
import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { CommentService } from "../services/commentService";
import { UserRole } from "../types/models";
import { UUID } from "crypto";

export class CommentController {
  /**
   * Create a new comment on a post
   * @route POST /api/v1/posts/:postId/comments
   */
  /**
   * Create a new comment on a post
   * @route POST /api/v1/posts/:postId/comments
   */
  static createComment = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const postId = req.params.postId as UUID;
      const { content, parent_id } = req.body;

      // Get any existing media from the body
      const existingMedia = req.body.media ? JSON.parse(req.body.media) : [];

      const commentData = {
        user_id: userId,
        post_id: postId,
        content,
        parent_id: parent_id as UUID | undefined,
        media: existingMedia,
      };

      // Pass the uploaded files to the service
      const comment = await CommentService.createComment(
        commentData,
        req.files as Express.Multer.File[],
      );

      res.status(201).json({
        status: "success",
        data: {
          comment,
        },
      });
    },
  );

  /**
   * Update a comment
   * @route PATCH /api/v1/comments/:commentId
   */
  static updateComment = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const commentId = res.locals.resourceId || req.params.commentId;
      const { content } = req.body;

      // Get any existing media from the body
      const existingMedia = req.body.media ? JSON.parse(req.body.media) : [];

      const updateData = {
        content,
        media: existingMedia,
      };

      const comment = await CommentService.updateComment(
        commentId,
        userId,
        updateData,
        req.files as Express.Multer.File[],
      );

      res.status(200).json({
        status: "success",
        data: {
          comment,
        },
      });
    },
  );
  /**
   * Get all comments for a post
   * @route GET /api/v1/posts/:postId/comments
   */
  static getPostComments = controllerHandler(
    async (req: Request, res: Response) => {
      const postId = req.params.postId;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const includeReplies = req.query.includeReplies !== "false"; // Default to true

      const { comments, total } = await CommentService.getPostComments(
        postId,
        page,
        limit,
        includeReplies,
      );

      res.status(200).json({
        status: "success",
        data: {
          comments,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    },
  );

  /**
   * Get replies for a specific comment
   * @route GET /api/v1/comments/:commentId/replies
   */
  static getCommentReplies = controllerHandler(
    async (req: Request, res: Response) => {
      const commentId = req.params.commentId;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const { replies, total } = await CommentService.getCommentReplies(
        commentId,
        page,
        limit,
      );

      res.status(200).json({
        status: "success",
        data: {
          replies,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    },
  );

  /**
   * Delete a comment
   * @route DELETE /api/v1/comments/:commentId
   */
  static deleteComment = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const commentId = res.locals.resourceId || req.params.commentId;
      const isAdmin =
        req.user!.role === UserRole.ADMIN ||
        req.user!.role === UserRole.MODERATOR;

      await CommentService.deleteComment(commentId, userId, isAdmin);

      res.status(204).send();
    },
  );

  /**
   * Get comment count for a post
   * @route GET /api/v1/posts/:postId/comments/count
   */
  static getCommentCount = controllerHandler(
    async (req: Request, res: Response) => {
      const postId = req.params.postId;

      const count = await CommentService.getCommentCount(postId);

      res.status(200).json({
        status: "success",
        data: {
          count,
        },
      });
    },
  );
}
