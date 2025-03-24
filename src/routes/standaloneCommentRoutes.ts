// src/routes/standaloneCommentRoutes.ts
import { Router } from "express";
import { CommentController } from "../controllers/commentController";
import { authenticate } from "../middlewares/authenticate";
import { validateUpdateComment } from "../middlewares/validators/commentValidator";
import { isCommentOwner } from "../utils/authCheckers";
import { UserRole } from "../types/models";
// Import the function directly
import { canAccessResource } from "../middlewares/resourceAuthorization";
import { uploadCommentMedia } from "../middlewares/commentMediaUpload";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/comments/:commentId/replies
 * @desc Get replies for a specific comment
 * @access Private
 */
router.get("/:commentId/replies", CommentController.getCommentReplies);

// Update the update comment route
/**
 * @route PATCH /api/v1/comments/:commentId
 * @desc Update a comment
 * @access Private (comment owner only)
 */
router.patch(
  "/:commentId",
  canAccessResource("commentId", isCommentOwner, true, []), // Only allow comment owner
  uploadCommentMedia, // Add the upload middleware
  validateUpdateComment,
  CommentController.updateComment
);
/**
 * @route DELETE /api/v1/comments/:commentId
 * @desc Delete a comment
 * @access Private (comment owner or admin/moderator)
 */
router.delete(
  "/:commentId",
  canAccessResource("commentId", isCommentOwner, true, [
    UserRole.ADMIN,
    UserRole.MODERATOR,
  ]), // Allow comment owner or admin/moderator
  CommentController.deleteComment
);

export default router;
