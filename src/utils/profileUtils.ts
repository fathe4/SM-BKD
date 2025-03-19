// src/utils/profileUtils.ts

import { supabase } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "./logger";

/**
 * Interface for basic user profile information
 */
export interface BasicUserProfile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
  bio?: string;
  location?: string;
  is_verified: boolean;
}

/**
 * Utility to get basic user profile information that can be reused across the application
 */
export async function getUserBasicProfile(
  userId: string
): Promise<BasicUserProfile> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, username, first_name, last_name, profile_picture, bio, location, is_verified"
      )
      .eq("id", userId)
      .single();

    if (error) {
      logger.error(`Error fetching basic profile for user ${userId}:`, error);
      throw new AppError(error.message, error.code === "PGRST116" ? 404 : 400);
    }

    return data as BasicUserProfile;
  } catch (error) {
    logger.error(`Error in getUserBasicProfile for user ${userId}:`, error);
    throw error instanceof AppError
      ? error
      : new AppError("Failed to fetch user profile", 500);
  }
}

/**
 * Get multiple basic user profiles
 */
export async function getMultipleUserProfiles(
  userIds: string[]
): Promise<BasicUserProfile[]> {
  if (!userIds.length) return [];

  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, username, first_name, last_name, profile_picture, bio, location, is_verified"
      )
      .in("id", userIds);

    if (error) {
      logger.error("Error fetching multiple user profiles:", error);
      throw new AppError(error.message, 400);
    }

    return data as BasicUserProfile[];
  } catch (error) {
    logger.error("Error in getMultipleUserProfiles:", error);
    throw error instanceof AppError
      ? error
      : new AppError("Failed to fetch user profiles", 500);
  }
}
