/* eslint-disable indent */
// src/controllers/postController.ts
import { Request, Response } from "express";
import { PostService } from "../services/postService";
import { controllerHandler } from "../utils/controllerHandler";
import { AppError } from "../middlewares/errorHandler";
import { PostVisibility } from "@/models";

export class PostController {
  /**
   * Create a new post
   * @route POST /api/v1/posts
   */
  static createPost = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postData = { ...req.body, user_id: userId };

    // Process post creation
    const post = await PostService.createPost(postData);

    // Process media if included
    if (req.body.media && Array.isArray(req.body.media)) {
      const mediaItems = req.body.media.map((media: any, index: number) => ({
        post_id: post.id,
        media_url: media.url,
        media_type: media.type,
        order: index,
      }));

      await PostService.addPostMedia(mediaItems);
    }

    // Get the complete post with media
    const completePost = await PostService.getPostById(post.id, userId);

    res.status(201).json({
      status: "success",
      data: {
        post: completePost,
      },
    });
  });

  /**
   * Get a post by ID
   * @route GET /api/v1/posts/:id
   */
  static getPost = controllerHandler(async (req: Request, res: Response) => {
    const postId = req.params.id;
    const userId = req.user?.id;

    const post = await PostService.getPostById(postId, userId);

    if (!post) {
      throw new AppError("Post not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: {
        post,
      },
    });
  });

  /**
   * Get posts for a user
   * @route GET /api/v1/posts/user/:userId
   */
  static getUserPosts = controllerHandler(
    async (req: Request, res: Response) => {
      const targetUserId = req.params.userId;
      const currentUserId = req.user?.id;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const { posts, total } = await PostService.getUserPosts(
        targetUserId,
        currentUserId,
        page,
        limit
      );

      res.status(200).json({
        status: "success",
        data: {
          posts,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  /**
   * Get posts for the current user's feed
   * @route GET /api/v1/posts/feed
   */
  static getFeed = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const { posts, total } = await PostService.getFeedPosts(
      userId,
      page,
      limit
    );

    res.status(200).json({
      status: "success",
      data: {
        posts,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  });

  /**
   * Update a post
   * @route PUT /api/v1/posts/:id
   */
  static updatePost = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postId = res.locals.postId;

    const updatedPost = await PostService.updatePost(postId, userId, req.body);

    res.status(200).json({
      status: "success",
      data: {
        post: updatedPost,
      },
    });
  });

  /**
   * Delete a post
   * @route DELETE /api/v1/posts/:id
   */
  static deletePost = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postId = res.locals.postId;
    // Post ownership or admin rights already verified in middleware

    await PostService.deletePost(postId, userId);

    res.status(204).send();
  });

  /**
   * Get all posts with filtering (admin function)
   * @route GET /api/v1/posts/all
   */
  static getAllPosts = controllerHandler(
    async (req: Request, res: Response) => {
      // Extract filter parameters from query
      const filters = {
        userId: req.query.userId as string,
        visibility: req.query.visibility as PostVisibility,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        searchQuery: req.query.search as string,
        isBoosted:
          req.query.isBoosted === "true"
            ? true
            : req.query.isBoosted === "false"
            ? false
            : undefined,
        isDeleted:
          req.query.isDeleted === "true"
            ? true
            : req.query.isDeleted === "false"
            ? false
            : undefined,
        sortBy: (req.query.sortBy as string) || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      };

      const { posts, total } = await PostService.getAllPosts(filters);

      res.status(200).json({
        status: "success",
        data: {
          posts,
          total,
          page: filters.page,
          totalPages: Math.ceil(total / filters.limit),
          limit: filters.limit,
        },
      });
    }
  );
}
