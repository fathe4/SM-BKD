// src/services/commentService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import {
  Comment,
  CommentCreate,
  CommentMedia,
  CommentUpdate,
} from "../models/interaction.model";
import { PostService } from "./postService";
import { StorageService } from "./storageService";

/**
 * Service class for comment-related operations
 */
export class CommentService {
  /**
   * Upload and process comment media files
   */
  static uploadCommentMedia = asyncHandler(
    async (
      files: Express.Multer.File[],
      userId: string
    ): Promise<CommentMedia[]> => {
      if (!files || files.length === 0) {
        return [];
      }

      const mediaItems: CommentMedia[] = [];

      for (const file of files) {
        // Upload the file to storage
        const uploadResult = await StorageService.uploadFile(
          "comment-media",
          file,
          userId // Use user ID as folder name
        );

        // Add the media item to the array
        mediaItems.push({
          url: uploadResult.publicUrl,
          type: file.mimetype.startsWith("image/") ? "image" : "document",
        });
      }

      return mediaItems;
    },
    "Failed to upload comment media"
  );
  /**
   * Create a new comment
   */
  // Modify the createComment method to handle file uploads
  static createComment = asyncHandler(
    async (
      commentData: CommentCreate,
      files?: Express.Multer.File[]
    ): Promise<Comment> => {
      // Check if post exists and is accessible to the user
      const post = await PostService.getPostById(
        commentData.post_id.toString(),
        commentData.user_id.toString()
      );

      if (!post) {
        throw new AppError("Post not found or not accessible", 404);
      }

      // If it's a reply, verify parent comment exists
      if (commentData.parent_id) {
        const parentComment = await this.getCommentById(
          commentData.parent_id.toString()
        );

        if (!parentComment) {
          throw new AppError("Parent comment not found", 404);
        }

        // Verify parent comment belongs to the same post
        if (
          parentComment.post_id.toString() !== commentData.post_id.toString()
        ) {
          throw new AppError(
            "Parent comment does not belong to this post",
            400
          );
        }
      }

      // Process uploaded files if any
      // Type assertion to ensure it's treated as CommentMedia[]
      const existingMedia = (commentData.media ||
        []) as unknown as CommentMedia[];
      let media: CommentMedia[] = [...existingMedia];

      if (files && files.length > 0) {
        const uploadedMedia = await this.uploadCommentMedia(
          files,
          commentData.user_id.toString()
        );
        media = [...media, ...uploadedMedia];
      }

      // Create the comment
      const { data, error } = await supabaseAdmin!
        .from("comments")
        .insert({
          ...commentData,
          media,
          is_deleted: false,
        })
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Comment;
    },
    "Failed to create comment"
  );
  /**
   * Get a comment by ID
   */
  static getCommentById = asyncHandler(
    async (commentId: string): Promise<Comment | null> => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No results found
          return null;
        }
        throw new AppError(error.message, 400);
      }

      return data as Comment;
    },
    "Failed to get comment"
  );

  /**
   * Get all comments for a post with pagination
   * Includes nested replies ordered by created_at
   */
  static getPostComments = asyncHandler(
    async (
      postId: string,
      page = 1,
      limit = 20,
      includeReplies = true
    ): Promise<{ comments: Comment[]; total: number }> => {
      const offset = (page - 1) * limit;

      // Get top-level comments first
      const query = supabase
        .from("comments")
        .select("*, users!inner(username, profile_picture)", { count: "exact" })
        .eq("post_id", postId)
        .eq("is_deleted", false)
        .is("parent_id", null) // Only top-level comments
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: topLevelComments, error, count } = await query;

      if (error) {
        throw new AppError(error.message, 400);
      }

      // If we want to include replies and have top-level comments
      if (includeReplies && topLevelComments && topLevelComments.length > 0) {
        // Get IDs of all top-level comments
        const commentIds = topLevelComments.map((comment) => comment.id);

        // Get all replies to these comments
        const { data: replies, error: repliesError } = await supabase
          .from("comments")
          .select("*, users!inner(username, profile_picture)")
          .eq("is_deleted", false)
          .in("parent_id", commentIds)
          .order("created_at", { ascending: true });

        if (repliesError) {
          throw new AppError(repliesError.message, 400);
        }

        // Group replies by parent_id
        const repliesByParent: Record<string, any[]> = {};
        replies?.forEach((reply) => {
          const parentId = reply.parent_id;
          if (!repliesByParent[parentId]) {
            repliesByParent[parentId] = [];
          }
          repliesByParent[parentId].push(reply);
        });

        // Add replies to their parent comments
        topLevelComments.forEach((comment) => {
          comment.replies = repliesByParent[comment.id] || [];
        });
      }

      return {
        comments: topLevelComments as unknown as Comment[],
        total: count || 0,
      };
    },
    "Failed to get post comments"
  );

  /**
   * Get all replies for a specific comment
   */
  static getCommentReplies = asyncHandler(
    async (
      commentId: string,
      page = 1,
      limit = 20
    ): Promise<{ replies: Comment[]; total: number }> => {
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("comments")
        .select("*, users!inner(username, profile_picture)", { count: "exact" })
        .eq("parent_id", commentId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        replies: data as unknown as Comment[],
        total: count || 0,
      };
    },
    "Failed to get comment replies"
  );

  // Also modify the updateComment method to handle file uploads
  static updateComment = asyncHandler(
    async (
      commentId: string,
      userId: string,
      updateData: CommentUpdate,
      files?: Express.Multer.File[]
    ): Promise<Comment> => {
      // First check if comment exists and belongs to user
      const { error: commentError } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .eq("user_id", userId)
        .single();

      if (commentError) {
        if (commentError.code === "PGRST116") {
          throw new AppError("Comment not found or not owned by user", 404);
        }
        throw new AppError(commentError.message, 400);
      }

      // Process uploaded files if any
      // Type assertion to ensure it's treated as CommentMedia[]
      const existingMedia = (updateData.media ||
        []) as unknown as CommentMedia[];
      let media: CommentMedia[] = [...existingMedia];

      if (files && files.length > 0) {
        const uploadedMedia = await this.uploadCommentMedia(files, userId);
        media = [...media, ...uploadedMedia];
      }

      // Update the comment
      const { data, error } = await supabaseAdmin!
        .from("comments")
        .update({
          ...updateData,
          media,
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Comment;
    },
    "Failed to update comment"
  );
  /**
   * Delete a comment (soft delete)
   */
  static deleteComment = asyncHandler(
    async (
      commentId: string,
      userId: string,
      isAdmin = false
    ): Promise<void> => {
      // First check if comment exists
      const { error: commentError } = await supabase
        .from("comments")
        .select("*")
        .eq("id", commentId)
        .single();

      if (commentError) {
        if (commentError.code === "PGRST116") {
          throw new AppError("Comment not found", 404);
        }
        throw new AppError(commentError.message, 400);
      }

      // Soft delete the comment
      const { error } = await supabaseAdmin!
        .from("comments")
        .update({
          is_deleted: true,
          content: isAdmin ? "[Removed by moderator]" : "[Deleted]",
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete comment"
  );

  /**
   * Get comment count for a post
   */
  static getCommentCount = asyncHandler(
    async (postId: string): Promise<number> => {
      const { count, error } = await supabase
        .from("comments")
        .select("id", { count: "exact" })
        .eq("post_id", postId)
        .eq("is_deleted", false);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return count || 0;
    },
    "Failed to get comment count"
  );
}
