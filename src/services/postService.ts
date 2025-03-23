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
        .select("*, post_media(*)")
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
        .select("*, post_media(*)", { count: "exact" })
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

      // Build feed query
      let query = supabase
        .from("posts")
        .select("*, post_media(*), users!inner(username, profile_picture)", {
          count: "exact",
        })
        .eq("is_deleted", false)
        .eq("visibility", PostVisibility.PUBLIC); // Default to only public posts

      if (friendIds.length > 0) {
        // Include posts from user and their friends
        query = query.or(
          `user_id.eq.${userId},and(user_id.in.(${friendIds.join(
            ","
          )}),or(visibility.eq.public,visibility.eq.friends))`
        );
      } else {
        // For users without friends, show:
        // 1. Their own posts (any visibility)
        // 2. Popular public posts from others
        query = query.or(
          `user_id.eq.${userId},and(user_id.neq.${userId},is_boosted.eq.true)`
        );
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

      // If we still got no posts, fall back to most recent public posts
      if (data.length === 0) {
        const {
          data: popularPosts,
          error: popularError,
          count: popularCount,
        } = await supabase
          .from("posts")
          .select("*, post_media(*), users!inner(username, profile_picture)", {
            count: "exact",
          })
          .eq("is_deleted", false)
          .eq("visibility", PostVisibility.PUBLIC)
          .neq("user_id", userId) // Not the current user's posts
          .order("view_count", { ascending: false }) // Order by popularity
          .limit(limit);

        if (popularError) {
          throw new AppError(popularError.message, 400);
        }

        return {
          posts: popularPosts as unknown as Post[],
          total: popularCount || 0,
        };
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
        .select("*, post_media(*), users!inner(username, profile_picture)", {
          count: "exact",
        });

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
}
