/* eslint-disable indent */
// src/controllers/postController.ts
import { Request, Response } from "express";
import { PostService } from "../services/postService";
import { controllerHandler } from "../utils/controllerHandler";
import { AppError } from "../middlewares/errorHandler";
import { MediaType, PostVisibility } from "../models";
import { StorageService } from "../services/storageService";

export class PostController {
  /**
   * Create a new post
   * @route POST /api/v1/posts
   */
  static createPost = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { media, ...restBody } = req.body; // Extract media separately
    const postData = { ...restBody, user_id: userId }; // Don't include media in postData

    // Process uploaded files if any
    let mediaItems: any[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Handle file uploads (existing code)
      // ...
    } else if (media && Array.isArray(media)) {
      // Handle media info from request body
      console.log("Processing media from request body:", media);
      mediaItems = media.map((mediaItem: any) => ({
        media_url: mediaItem.url,
        media_type: mediaItem.media_type,
        order: mediaItem.order || 0,
      }));
    }

    // Process post creation
    const post = await PostService.createPost(postData);

    // Add media items to post if there are any
    if (mediaItems.length > 0) {
      const postMediaItems = mediaItems.map((item: any) => ({
        post_id: post.id,
        ...item,
      }));

      await PostService.addPostMedia(postMediaItems);
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
   * Update a post
   * @route PUT /api/v1/posts/:id
   */
  static updatePost = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postId = res.locals.postId;

    let shouldUpdateMedia = false;
    let mediaItems = [];

    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      shouldUpdateMedia = true;

      // Process and upload each file
      mediaItems = await Promise.all(
        (req.files as Express.Multer.File[]).map(async (file, index) => {
          // Determine media type
          let mediaType: MediaType;
          if (file.mimetype.startsWith("image/")) {
            mediaType = MediaType.IMAGE;
          } else if (file.mimetype.startsWith("video/")) {
            mediaType = MediaType.VIDEO;
          } else {
            mediaType = MediaType.DOCUMENT;
          }

          // Upload file
          const uploadResult = await StorageService.uploadFile(
            "post-media",
            file,
            userId
          );

          return {
            post_id: postId,
            media_url: uploadResult.publicUrl,
            media_type: mediaType,
            order: index,
          };
        })
      );
    } else if (req.body.media && Array.isArray(req.body.media)) {
      // Handle media from request body
      shouldUpdateMedia = true;

      mediaItems = req.body.media.map((media: any) => ({
        post_id: postId,
        media_url: media.url,
        media_type: media.media_type,
        order: media.order,
      }));
    }

    // Handle media updates if needed
    if (shouldUpdateMedia) {
      // First delete existing media
      await PostService.deletePostMedia(postId);

      // Then add the new media
      if (mediaItems.length > 0) {
        await PostService.addPostMedia(mediaItems);
      }
    }

    // Update the post data
    const updatedPost = await PostService.updatePost(postId, userId, req.body);

    res.status(200).json({
      status: "success",
      data: {
        post: updatedPost,
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
    const page = req.query.page
      ? Math.max(1, parseInt(req.query.page as string))
      : 1;
    const limit = req.query.limit
      ? Math.min(50, Math.max(1, parseInt(req.query.limit as string)))
      : 10;

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

  /**
   * Get posts for the authenticated user
   * @route GET /api/v1/posts/my
   */
  static getMyPosts = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const { posts, total } = await PostService.getMyPosts(userId, page, limit);

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
}
