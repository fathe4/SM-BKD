import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import { logger } from "../utils/logger";

// Types
export interface Photo {
  id: string;
  post_id: string;
  media_url: string;
  media_type: string;
  created_at: string;
}

export interface PhotoCreate {
  post_id: string;
  media_url: string;
  media_type: string;
}

interface PhotoWithPost {
  id: string;
  posts: {
    user_id: string;
  };
}

// Helper functions
const handleDatabaseError = (error: any, message: string) => {
  if (error) {
    logger.error(`Database error: ${error.message}`);
    throw new AppError(error.message, 400);
  }
};

// Main service functions
export const getPhotosByPostId = asyncHandler(
  async (postId: string): Promise<Photo[]> => {
    const { data, error } = await supabase
      .from("post_media")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false });

    handleDatabaseError(error, "Failed to fetch photos");
    return data as Photo[];
  },
  "Failed to get photos"
);

export const getPhotosByUserId = asyncHandler(
  async (
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: { photos: Photo[] }; total: number }> => {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from("post_media")
      .select("*, posts!inner(user_id)", { count: "exact" })
      .eq("posts.user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    handleDatabaseError(error, "Failed to fetch user photos");
    return {
      data: { photos: data as Photo[] },
      total: count || 0,
    };
  },
  "Failed to get user photos"
);

export const createPhoto = asyncHandler(
  async (photoData: PhotoCreate): Promise<Photo> => {
    const { data, error } = await supabaseAdmin!
      .from("post_media")
      .insert(photoData)
      .select()
      .single();

    handleDatabaseError(error, "Failed to create photo");
    return data as Photo;
  },
  "Failed to create photo"
);

export const deletePhoto = asyncHandler(
  async (photoId: string, userId: string): Promise<void> => {
    // First verify the photo belongs to a post owned by the user
    const { data: photo, error: fetchError } = await supabase
      .from("post_media")
      .select("id, posts!inner(user_id)")
      .eq("id", photoId)
      .single();

    handleDatabaseError(fetchError, "Failed to fetch photo");

    if (!photo) {
      throw new AppError("Photo not found", 404);
    }

    // Type assertion with unknown as intermediate step
    const photoWithPost = photo as unknown as PhotoWithPost;
    if (photoWithPost.posts.user_id !== userId) {
      throw new AppError("Unauthorized to delete this photo", 403);
    }

    const { error: deleteError } = await supabaseAdmin!
      .from("post_media")
      .delete()
      .eq("id", photoId);

    handleDatabaseError(deleteError, "Failed to delete photo");
  },
  "Failed to delete photo"
);

export const updatePhoto = asyncHandler(
  async (
    photoId: string,
    userId: string,
    updates: Partial<PhotoCreate>
  ): Promise<Photo> => {
    // First verify the photo belongs to a post owned by the user
    const { data: photo, error: fetchError } = await supabase
      .from("post_media")
      .select("id, posts!inner(user_id)")
      .eq("id", photoId)
      .single();

    handleDatabaseError(fetchError, "Failed to fetch photo");

    if (!photo) {
      throw new AppError("Photo not found", 404);
    }

    // Type assertion with unknown as intermediate step
    const photoWithPost = photo as unknown as PhotoWithPost;
    if (photoWithPost.posts.user_id !== userId) {
      throw new AppError("Unauthorized to update this photo", 403);
    }

    const { data, error: updateError } = await supabaseAdmin!
      .from("post_media")
      .update(updates)
      .eq("id", photoId)
      .select()
      .single();

    handleDatabaseError(updateError, "Failed to update photo");
    return data as Photo;
  },
  "Failed to update photo"
);
