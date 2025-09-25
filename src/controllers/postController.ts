/* eslint-disable indent */
// src/controllers/postController.ts
import { Request, Response } from "express";
import { PostService } from "../services/postService";
import { controllerHandler } from "../utils/controllerHandler";
import { AppError } from "../middlewares/errorHandler";
import { MediaType, PostVisibility } from "../models";
import { StorageService } from "../services/storageService";
import { BoostStatus } from "../models/boost.model";

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

    const { posts, total, composition } = await PostService.getFeedPosts(
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
        composition,
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

  /**
   * Create a new boost for a post
   * @route POST /api/v1/posts/:postId/boosts
   */
  static createPostBoost = async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const postId = req.params.postId;
      const boostData = req.body;
      const boost = await PostService.createPostBoost(
        userId,
        postId,
        boostData
      );
      res.status(201).json({ status: "success", data: { boost } });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };

  /**
   * List all boosts for the authenticated user
   * @route GET /api/v1/posts/boosts/my
   */
  static getUserBoosts = controllerHandler(async (req, res) => {
    const userId = req.user!.id;
    const status = req.query.status as BoostStatus | undefined;
    const boosts = await PostService.getUserBoosts(userId, status);
    res.status(200).json({ status: "success", data: { boosts } });
  });

  /**
   * Get boost status for a post
   * @route GET /api/v1/posts/:postId/boosts/status
   */
  static getPostBoostStatus = controllerHandler(async (req, res) => {
    const postId = req.params.postId;
    const boost = await PostService.getPostBoostStatus(postId);
    res.status(200).json({ status: "success", data: { boost } });
  });

  /**
   * Update the status of a boost
   * @route PATCH /api/v1/posts/boosts/:boostId/status
   * @body { status: BoostStatus }
   */
  static updateBoostStatus = controllerHandler(async (req, res) => {
    const boostId = req.params.boostId;
    const { status } = req.body;
    await PostService.updateBoostStatus(boostId, status);
    res.status(200).json({ status: "success" });
  });

  /**
   * Activate a boost (set status to ACTIVE, expire others)
   * @route PATCH /api/v1/posts/boosts/:boostId/activate
   */
  static activateBoost = controllerHandler(async (req, res) => {
    const boostId = req.params.boostId;
    await PostService.activateBoost(boostId);
    res.status(200).json({ status: "success" });
  });

  /**
   * Get all boosted posts with comprehensive filtering
   * @route GET /api/v1/posts/boosts
   * @query { status, userId, postId, city, country, minAmount, maxAmount, minDays, maxDays, minEstimatedReach, maxEstimatedReach, createdAfter, createdBefore, startDate, endDate, expiresAfter, expiresBefore, includePostDetails, includeUserDetails, limit, offset, sortBy, sortOrder }
   */
  static getAllBoostedPosts = controllerHandler(async (req, res) => {
    const {
      status,
      userId,
      postId,
      city,
      country,
      minAmount,
      maxAmount,
      minDays,
      maxDays,
      minEstimatedReach,
      maxEstimatedReach,
      createdAfter,
      createdBefore,
      startDate,
      endDate,
      expiresAfter,
      expiresBefore,
      includePostDetails,
      includeUserDetails,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = req.query;

    // Parse query parameters
    const filters: any = {};

    if (status) {
      filters.status = Array.isArray(status) ? status : [status];
    }
    if (userId) filters.userId = userId as string;
    if (postId) filters.postId = postId as string;
    if (city) filters.city = city as string;
    if (country) filters.country = country as string;
    if (minAmount) filters.minAmount = parseFloat(minAmount as string);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    if (minDays) filters.minDays = parseInt(minDays as string);
    if (maxDays) filters.maxDays = parseInt(maxDays as string);
    if (minEstimatedReach)
      filters.minEstimatedReach = parseInt(minEstimatedReach as string);
    if (maxEstimatedReach)
      filters.maxEstimatedReach = parseInt(maxEstimatedReach as string);
    // Handle date filtering - support both startDate/endDate and createdAfter/createdBefore
    if (startDate) {
      filters.createdAfter = new Date(startDate as string);
    } else if (createdAfter) {
      filters.createdAfter = new Date(createdAfter as string);
    }

    if (endDate) {
      filters.createdBefore = new Date(endDate as string);
    } else if (createdBefore) {
      filters.createdBefore = new Date(createdBefore as string);
    }
    if (expiresAfter) filters.expiresAfter = new Date(expiresAfter as string);
    if (expiresBefore)
      filters.expiresBefore = new Date(expiresBefore as string);
    if (includePostDetails)
      filters.includePostDetails = includePostDetails === "true";
    if (includeUserDetails)
      filters.includeUserDetails = includeUserDetails === "true";
    if (limit) filters.limit = parseInt(limit as string);
    if (offset) filters.offset = parseInt(offset as string);
    if (sortBy) filters.sortBy = sortBy as string;
    if (sortOrder) filters.sortOrder = sortOrder as string;

    const result = await PostService.getAllBoostedPosts(filters);

    res.status(200).json({
      status: "success",
      data: result,
      pagination: {
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      },
    });
  });
}
