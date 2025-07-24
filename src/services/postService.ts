// src/services/postService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import {
  Post,
  PostCreate,
  PostUpdate,
  PostVisibility,
  PostMedia,
  PostMediaCreate,
} from "../models/post.model";
import { AppError } from "../middlewares/errorHandler";
import { FriendshipStatus } from "../models/friendship.model";
import { asyncHandler } from "../utils/asyncHandler";
import { StorageService } from "./storageService";
import { logger } from "../utils/logger";
import { PostBoost, PostBoostCreate, BoostStatus } from "../models/boost.model";

/**
 * Service class for post-related operations
 */
export class PostService {
  /**
   * Create a new post
   */
  static createPost = asyncHandler(
    async (postData: PostCreate): Promise<Post> => {
      const { data, error } = await supabaseAdmin!
        .from("posts")
        .insert({
          ...postData,
          is_deleted: false,
          view_count: 0,
        })
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Post;
    },
    "Failed to create post"
  );

  /**
   * Add media to a post
   */
  static addPostMedia = asyncHandler(
    async (mediaData: PostMediaCreate[]): Promise<PostMedia[]> => {
      if (!mediaData || mediaData.length === 0) {
        return [];
      }

      const { data, error } = await supabaseAdmin!
        .from("post_media")
        .insert(mediaData)
        .select();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as PostMedia[];
    },
    "Failed to add post media"
  );

  /**
   * Get a post by ID
   * Handles visibility permissions and includes media
   */
  static getPostById = asyncHandler(
    async (postId: string, currentUserId?: string): Promise<Post | null> => {
      // First get the post
      const { data: post, error } = await supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(id, username, first_name, last_name, profile_picture)"
        )
        .eq("id", postId)
        .eq("is_deleted", false)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No results found
          return null;
        }
        throw new AppError(error.message, 400);
      }

      // Check visibility permissions
      if (!currentUserId) {
        // If no current user, only return public posts
        if (post.visibility !== PostVisibility.PUBLIC) {
          return null;
        }
      } else if (currentUserId !== post.user_id) {
        // Current user is not the author, check visibility
        if (post.visibility === PostVisibility.PRIVATE) {
          return null;
        }

        if (post.visibility === PostVisibility.FRIENDS) {
          // Check if users are friends
          const areFriends = await this.checkIfUsersAreFriends(
            currentUserId,
            post.user_id
          );
          if (!areFriends) {
            return null;
          }
        }
      }

      // Increment view count if not the post author
      if (currentUserId && currentUserId !== post.user_id) {
        await this.incrementPostViewCount(postId);
      }

      return post as Post;
    },
    "Failed to get post"
  );

  /**
   * Get posts for a specific user with pagination
   */
  static getUserPosts = asyncHandler(
    async (
      userId: string,
      currentUserId?: string,
      page = 1,
      limit = 10
    ): Promise<{ posts: Post[]; total: number }> => {
      const offset = (page - 1) * limit;

      // Build query based on visibility permissions
      let query = supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(id, username, first_name, last_name, profile_picture)",
          { count: "exact" }
        )
        .eq("user_id", userId)
        .eq("is_deleted", false);

      // If current user is not the owner, filter by visibility
      if (!currentUserId || currentUserId !== userId) {
        if (!currentUserId) {
          // No authenticated user, only show public posts
          query = query.eq("visibility", PostVisibility.PUBLIC);
        } else {
          // Check if users are friends
          const areFriends = await this.checkIfUsersAreFriends(
            currentUserId,
            userId
          );

          if (areFriends) {
            // Show public and friends-only posts
            query = query.in("visibility", [
              PostVisibility.PUBLIC,
              PostVisibility.FRIENDS,
            ]);
          } else {
            // Only show public posts
            query = query.eq("visibility", PostVisibility.PUBLIC);
          }
        }
      }

      // Add ordering and pagination
      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Execute query
      const { data, error, count } = await query;

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        posts: data as Post[],
        total: count || 0,
      };
    },
    "Failed to get user posts"
  );

  /**
   * Get posts for the feed with pagination
   * Includes posts from user and their friends, or popular posts if no friends
   */
  static getFeedPosts = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 10
    ): Promise<{ posts: Post[]; total: number }> => {
      // Validate pagination parameters
      if (page < 1) {
        throw new AppError("Page number must be greater than 0", 400);
      }
      if (limit < 1) {
        throw new AppError("Limit must be greater than 0", 400);
      }
      if (limit > 50) {
        throw new AppError("Limit cannot exceed 50 posts per page", 400);
      }

      const offset = (page - 1) * limit;

      // Get user's friends
      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", FriendshipStatus.ACCEPTED);

      if (friendshipsError) {
        throw new AppError(friendshipsError.message, 400);
      }

      // Extract friend IDs
      const friendIds = friendships.map((f) =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );

      // If user has no friends, show default posts
      if (friendIds.length === 0) {
        const {
          data: defaultPosts,
          error: defaultError,
          count: defaultCount,
        } = await supabase
          .from("posts")
          .select(
            "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
            {
              count: "exact",
            }
          )
          .eq("is_deleted", false)
          .eq("visibility", PostVisibility.PUBLIC)
          .neq("user_id", userId) // Not the current user's posts
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (defaultError) {
          throw new AppError(defaultError.message, 400);
        }

        return {
          posts: defaultPosts as unknown as Post[],
          total: defaultCount || 0,
        };
      }

      // Build feed query for users with friends
      let query = supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
          {
            count: "exact",
          }
        )
        .eq("is_deleted", false)
        .eq("visibility", PostVisibility.PUBLIC);

      // Include posts from user and their friends
      query = query.or(
        `user_id.eq.${userId},and(user_id.in.(${friendIds.join(
          ","
        )}),or(visibility.eq.public,visibility.eq.friends))`
      );

      // Add ordering and pagination
      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Execute query
      const { data, error, count } = await query;

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        posts: data as unknown as Post[],
        total: count || 0,
      };
    },
    "Failed to get feed posts"
  );

  /**
   * Update a post
   */
  static updatePost = asyncHandler(
    async (
      postId: string,
      userId: string,
      updateData: PostUpdate
    ): Promise<Post> => {
      // Check if post exists and belongs to user
      const post = await this.getPostById(postId, userId);

      if (!post) {
        throw new AppError("Post not found", 404);
      }

      // Update post
      const { data, error } = await supabaseAdmin!
        .from("posts")
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)
        .select("*, post_media(*)")
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Post;
    },
    "Failed to update post"
  );

  /**
   * Delete a post (soft delete)
   */
  static deletePost = asyncHandler(
    async (postId: string, userId: string): Promise<void> => {
      // Check if post exists and belongs to user
      const post = await this.getPostById(postId, userId);

      if (!post) {
        throw new AppError("Post not found", 404);
      }

      // Soft delete by setting is_deleted flag
      const { error } = await supabaseAdmin!
        .from("posts")
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete post"
  );

  /**
   * Check if two users are friends
   * Private helper method
   */
  private static checkIfUsersAreFriends = asyncHandler(
    async (userId1: string, userId2: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`
        )
        .eq("status", FriendshipStatus.ACCEPTED)
        .maybeSingle();

      if (error) {
        return false;
      }

      return !!data;
    },
    "Failed to check friendship status"
  );

  /**
   * Increment post view count
   * Private helper method
   */
  private static incrementPostViewCount = asyncHandler(
    async (postId: string): Promise<void> => {
      // First fetch the current view count
      const { data: post, error: fetchError } = await supabase
        .from("posts")
        .select("view_count")
        .eq("id", postId)
        .single();

      if (fetchError) {
        throw new AppError(fetchError.message, 400);
      }

      // Then update with the incremented value
      const { error: updateError } = await supabaseAdmin!
        .from("posts")
        .update({
          view_count: (post.view_count || 0) + 1,
        })
        .eq("id", postId);

      if (updateError) {
        throw new AppError(updateError.message, 400);
      }
    },
    "Failed to increment view count"
  );

  /**
   * Get all posts with advanced filtering capabilities (admin, moderator function)
   */
  static getAllPosts = asyncHandler(
    async (options: {
      userId?: string;
      visibility?: PostVisibility;
      startDate?: string;
      endDate?: string;
      searchQuery?: string;
      isBoosted?: boolean;
      isDeleted?: boolean;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      page?: number;
      limit?: number;
    }): Promise<{ posts: Post[]; total: number }> => {
      const {
        userId,
        visibility,
        startDate,
        endDate,
        searchQuery,
        isBoosted,
        isDeleted = false, // Default to showing non-deleted posts
        sortBy = "created_at",
        sortOrder = "desc",
        page = 1,
        limit = 10,
      } = options;

      const offset = (page - 1) * limit;

      // Start building query
      let query = supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
          {
            count: "exact",
          }
        );

      // Apply filters
      if (userId) {
        query = query.eq("user_id", userId);
      }

      if (visibility) {
        query = query.eq("visibility", visibility);
      }

      if (startDate) {
        query = query.gte("created_at", startDate);
      }

      if (endDate) {
        query = query.lte("created_at", endDate);
      }

      if (searchQuery) {
        query = query.ilike("content", `%${searchQuery}%`);
      }

      if (isBoosted !== undefined) {
        query = query.eq("is_boosted", isBoosted);
      }

      // Apply deleted filter
      query = query.eq("is_deleted", isDeleted);

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      // Execute query
      const { data, error, count } = await query;

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        posts: data as unknown as Post[],
        total: count || 0,
      };
    },
    "Failed to get all posts"
  );

  /**
   * Delete all media for a post
   */
  static deletePostMedia = asyncHandler(
    async (postId: string): Promise<void> => {
      // First get the current media items to delete them from storage later
      const { data: mediaItems, error: fetchError } = await supabase
        .from("post_media")
        .select("media_url")
        .eq("post_id", postId);

      if (fetchError) {
        throw new AppError(fetchError.message, 400);
      }

      // Delete the media records from the database
      const { error: deleteError } = await supabaseAdmin!
        .from("post_media")
        .delete()
        .eq("post_id", postId);

      if (deleteError) {
        throw new AppError(deleteError.message, 400);
      }

      // Attempt to delete the files from storage
      // This is best-effort - we don't want to fail if the file is already gone
      for (const item of mediaItems) {
        try {
          // Extract the file path from the URL
          const urlParts = item.media_url.split("/public/");
          if (urlParts.length > 1) {
            const bucketAndPath = urlParts[1].split("/");
            if (bucketAndPath.length > 1) {
              bucketAndPath.shift(); // Remove bucket name
              const filePath = bucketAndPath.join("/");

              // Delete the file from storage
              await StorageService.deleteFile("post-media", filePath);
            }
          }
        } catch (error) {
          // Log but don't throw - we want to continue even if one file fails
          logger.warn(`Failed to delete media file: ${item.media_url}`, error);
        }
      }
    },
    "Failed to delete post media"
  );

  /**
   * Get posts for the authenticated user with pagination
   */
  static getMyPosts = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 10
    ): Promise<{ posts: Post[]; total: number }> => {
      // We can leverage the existing getUserPosts method since the logic is the same
      // The only difference is we're using the authenticated user's ID
      // and we don't need visibility checks since users can always see their own posts
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
          {
            count: "exact",
          }
        )
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        posts: data as unknown as Post[],
        total: count || 0,
      };
    },
    "Failed to get my posts"
  );

  /**
   * Create a new post boost (status: pending_payment)
   */
  static createPostBoost = asyncHandler(
    async (
      userId: string,
      postId: string,
      boostData: Omit<PostBoostCreate, "user_id" | "post_id" | "amount">
    ): Promise<PostBoost> => {
      // Check for existing active or pending boost for this post
      const { data: existing, error: existingError } = await supabase
        .from("post_boosts")
        .select("id, status")
        .eq("post_id", postId)
        .in("status", [
          BoostStatus.ACTIVE,
          BoostStatus.PAUSE,
          BoostStatus.PENDING_PAYMENT,
        ])
        .maybeSingle();
      if (existing && !existingError) {
        throw new AppError(
          "A boost is already active or pending for this post.",
          400
        );
      }

      // Fetch the correct pricing tier for the requested days
      const { data: pricing, error: pricingError } = await supabase
        .from("boost_pricing")
        .select("*")
        .lte("min_days", boostData.days)
        .or(`max_days.gte.${boostData.days},max_days.is.null`)
        .eq("is_active", true)
        .order("min_days", { ascending: false })
        .limit(1)
        .single();

      if (pricingError || !pricing) {
        throw new AppError(
          "No valid boost pricing tier found for the requested duration.",
          400
        );
      }

      // Calculate the amount
      const rawPrice = pricing.base_price_per_day * boostData.days;
      const discount = pricing.discount_percent || 0;
      const amount = +(rawPrice * (1 - discount / 100)).toFixed(2);

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + boostData.days * 24 * 60 * 60 * 1000
      );
      console.log(boostData, "boostData");

      const { data, error } = await supabaseAdmin!
        .from("post_boosts")
        .insert({
          ...boostData,
          user_id: userId,
          post_id: postId,
          amount,
          status: BoostStatus.PENDING_PAYMENT,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw new AppError(error.message, 400);
      return data as PostBoost;
    },
    "Failed to create post boost"
  );

  /**
   * List all boosts for a user (optionally filter by status)
   */
  static getUserBoosts = asyncHandler(
    async (userId: string, status?: BoostStatus): Promise<PostBoost[]> => {
      let query = supabase
        .from("post_boosts")
        .select("*")
        .eq("user_id", userId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw new AppError(error.message, 400);
      return data as PostBoost[];
    },
    "Failed to get user boosts"
  );

  /**
   * Get boost status for a post
   */
  static getPostBoostStatus = asyncHandler(
    async (postId: string): Promise<PostBoost | null> => {
      const { data, error } = await supabase
        .from("post_boosts")
        .select("*")
        .eq("post_id", postId)
        .in("status", [
          BoostStatus.ACTIVE,
          BoostStatus.PAUSE,
          BoostStatus.PENDING_PAYMENT,
        ])
        .maybeSingle();
      if (error) throw new AppError(error.message, 400);
      return (data as PostBoost) || null;
    },
    "Failed to get post boost status"
  );

  /**
   * Update the status of a boost (handles all status changes)
   */
  static updateBoostStatus = asyncHandler(
    async (boostId: string, status: BoostStatus): Promise<void> => {
      // For statuses other than ACTIVE
      if (status === BoostStatus.ACTIVE) {
        throw new AppError("Use activateBoost for activation logic.", 400);
      }
      const { error } = await supabaseAdmin!
        .from("post_boosts")
        .update({ status })
        .eq("id", boostId);

      console.log(error, "error update boost");

      if (error) throw new AppError(error.message, 400);
    },
    "Failed to update boost status"
  );

  static activateBoost = asyncHandler(
    async (boostId: string): Promise<void> => {
      // Fetch the boost to get post_id and days if needed
      const { data: boost, error: fetchError } = await supabase
        .from("post_boosts")
        .select("id, post_id, days")
        .eq("id", boostId)
        .single();
      if (fetchError || !boost) throw new AppError("Boost not found", 404);

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + boost.days * 24 * 60 * 60 * 1000
      );
      // Expire all other boosts for this post
      await supabaseAdmin!
        .from("post_boosts")
        .update({ status: BoostStatus.EXPIRED })
        .eq("post_id", boost.post_id)
        .neq("id", boostId)
        .in("status", [BoostStatus.ACTIVE, BoostStatus.PAUSE]);
      // Activate this boost
      const { error } = await supabaseAdmin!
        .from("post_boosts")
        .update({
          status: BoostStatus.ACTIVE,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", boostId);
      if (error) throw new AppError(error.message, 400);
    },
    "Failed to activate boost"
  );
}
