// src/routes/commentRoutes.ts
import { Router } from "express";
import { CommentController } from "../controllers/commentController";
import { authenticate } from "../middlewares/authenticate";
import { validateCreateComment } from "../middlewares/validators/commentValidator";
import { uploadCommentMedia } from "../middlewares/commentMediaUpload";

const router = Router();

// All routes require authentication
router.use(authenticate);
// Update the create comment route
/**
 * @route POST /api/v1/posts/:postId/comments
 * @desc Create a new comment on a post
 * @access Private
 */
router.post(
  "/:postId/comments",
  uploadCommentMedia, // Add the upload middleware before validation
  validateCreateComment,
  CommentController.createComment,
);

/**
 * @route GET /api/v1/posts/:postId/comments
 * @desc Get all comments for a post
 * @access Private
 */
router.get("/:postId/comments", CommentController.getPostComments);

/**
 * @route GET /api/v1/posts/:postId/comments/count
 * @desc Get comment count for a post
 * @access Private
 */
router.get("/:postId/comments/count", CommentController.getCommentCount);

export default router;
