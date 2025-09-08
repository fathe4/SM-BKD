// src/utils/authCheckers.ts
import { supabase } from "../config/supabase";
import { ResourceOwnershipChecker } from "../middlewares/resourceAuthorization";

/**
 * Check if a user owns a comment
 */
export const isCommentOwner: ResourceOwnershipChecker = async (
  commentId,
  userId,
) => {
  const { data, error } = await supabase
    .from("comments")
    .select("id")
    .eq("id", commentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
};

/**
 * Check if a user owns a post
 */
export const isPostOwner: ResourceOwnershipChecker = async (postId, userId) => {
  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
};

/**
 * Check if a user owns a reaction
 */
export const isReactionOwner: ResourceOwnershipChecker = async (
  reactionId,
  userId,
) => {
  const { data, error } = await supabase
    .from("reactions")
    .select("id")
    .eq("id", reactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !!data;
};
