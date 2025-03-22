// src/routes/postRoutes.ts
import { Router } from "express";
import { PostController } from "../controllers/postController";
import { authenticate } from "../middlewares/authenticate";
import { canAccessPost } from "../middlewares/postAuthorization";
import {
  validateCreatePost,
  validateUpdatePost,
} from "../middlewares/validators/postValidator";
import { UserRole } from "../types/models";
import { canAccessProfile } from "../middlewares/canAccess";

const router = Router();

// Apply authentication to routes that require it
router.use(authenticate);

/**
 * @route GET /api/v1/posts/feed
 * @desc Get posts for the current user's feed
 * @access Private
 */
router.get("/feed", PostController.getFeed);

/**
 * @route GET /api/v1/posts/user/:userId
 * @desc Get posts for a specific user
 * @access Private and Public (depending on post visibility)
 */
router.get("/user/:userId", PostController.getUserPosts);

/**
 * @route POST /api/v1/posts
 * @desc Create a new post
 * @access Private
 */
router.post("/", validateCreatePost, PostController.createPost);

/**
 * @route GET /api/v1/posts/admin/all
 * @desc Get all posts with filtering (admin only)
 * @access Admin only
 */
router.get(
  "/all",
  authenticate,
  canAccessProfile(false, [UserRole.ADMIN, UserRole.MODERATOR]), // Only admins can access, not for regular users
  PostController.getAllPosts
);

/**
 * @route GET /api/v1/posts/:id
 * @desc Get a post by ID
 * @access Private and Public (depending on post visibility)
 */
router.get("/:id", PostController.getPost);

/**
 * @route PUT /api/v1/posts/:id
 * @desc Update a post
 * @access Private (post owner only)
 */
router.put(
  "/:id",
  canAccessPost(true, []), // Only post owner can update
  validateUpdatePost,
  PostController.updatePost
);

/**
 * @route DELETE /api/v1/posts/:id
 * @desc Delete a post
 * @access Private (post owner or admin/moderator)
 */
router.delete(
  "/:id",
  canAccessPost(true, [UserRole.ADMIN, UserRole.MODERATOR]), // Post owner, admin, or moderator can delete
  PostController.deletePost
);

export default router;
