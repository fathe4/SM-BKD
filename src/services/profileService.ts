// src/services/profileService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { Profile, ProfileUpdate } from "../models/profile.model";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import { ProfileWithUserDetails } from "@/types/models";

export class ProfileService {
  /**
   * Get a user's profile
   */
  static async getProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
        *,
        user:users(
          id, 
          first_name, 
          last_name, 
          username, 
          profile_picture, 
          is_verified
        )
      `
        )
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is the error code for "no rows returned"
        logger.error("Error fetching profile:", error);
        throw new AppError(error.message, 400);
      }

      return data as Profile | null;
    } catch (error) {
      logger.error("Error in getProfile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch profile", 500);
    }
  }

  /**
   * Create or update a user profile
   */
  static async upsertProfile(
    profileData: Omit<Profile, "id" | "created_at" | "updated_at">
  ): Promise<Profile> {
    try {
      // Check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", profileData.user_id)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        logger.error("Error checking profile existence:", checkError);
        throw new AppError(checkError.message, 400);
      }

      let result;

      if (existingProfile) {
        // Update existing profile
        const { data, error } = await supabaseAdmin!
          .from("profiles")
          .update(profileData)
          .eq("user_id", profileData.user_id)
          .select()
          .single();

        if (error) {
          logger.error("Error updating profile:", error);
          throw new AppError(error.message, 400);
        }

        result = data;
      } else {
        // Create new profile
        const { data, error } = await supabaseAdmin!
          .from("profiles")
          .insert(profileData)
          .select()
          .single();

        if (error) {
          logger.error("Error creating profile:", error);
          throw new AppError(error.message, 400);
        }

        result = data;
      }

      return result as Profile;
    } catch (error) {
      logger.error("Error in upsertProfile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create/update profile", 500);
    }
  }

  /**
   * Update specific profile fields
   */
  static async updateProfile(
    userId: string,
    updateData: ProfileUpdate
  ): Promise<Profile> {
    try {
      // Check if profile exists
      const existingProfile = await this.getProfile(userId);

      if (!existingProfile) {
        // Create a new profile if it doesn't exist
        return await this.upsertProfile({ user_id: userId, ...updateData });
      }

      // Update existing profile
      const { data, error } = await supabaseAdmin!
        .from("profiles")
        .update(updateData)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating profile:", error);
        throw new AppError(error.message, 400);
      }

      return data as Profile;
    } catch (error) {
      logger.error("Error in updateProfile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update profile", 500);
    }
  }

  /**
   * Delete a user profile
   */
  static async deleteProfile(userId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin!
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (error) {
        logger.error("Error deleting profile:", error);
        throw new AppError(error.message, 400);
      }
    } catch (error) {
      logger.error("Error in deleteProfile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete profile", 500);
    }
  }

  /**
   * Get multiple profiles with pagination
   */
  /**
   * Get multiple profiles with pagination and user details
   */
  static async getProfiles(
    page = 1,
    limit = 10,
    filters?: {
      location?: string;
      interests?: string[];
      ageRange?: { min?: number; max?: number };
    }
  ): Promise<{ profiles: ProfileWithUserDetails[]; total: number }> {
    try {
      // Calculate offset
      const offset = (page - 1) * limit;

      // Build the query
      let query = supabase.from("profiles").select(
        `
        *,
        user:users(
          id, 
          first_name, 
          last_name, 
          username, 
          profile_picture, 
          cover_picture, 
          is_verified
        )
      `,
        { count: "exact" }
      );

      // Apply filters if provided
      if (filters) {
        if (filters.location) {
          query = query.ilike("location", `%${filters.location}%`);
        }

        if (filters.interests && filters.interests.length > 0) {
          // Filter by any matching interest
          filters.interests.forEach((interest) => {
            query = query.or(
              `interests->categories.cs.{${interest}},interests->tags.cs.{${interest}}`
            );
          });
        }

        if (filters.ageRange) {
          const now = new Date();

          if (filters.ageRange.min !== undefined) {
            // Calculate maximum birth date for minimum age
            const maxBirthYear = now.getFullYear() - filters.ageRange.min;
            const maxBirthDate = new Date(
              maxBirthYear,
              now.getMonth(),
              now.getDate()
            );
            query = query.lte("birth_date", maxBirthDate.toISOString());
          }

          if (filters.ageRange.max !== undefined) {
            // Calculate minimum birth date for maximum age
            const minBirthYear = now.getFullYear() - filters.ageRange.max;
            const minBirthDate = new Date(
              minBirthYear,
              now.getMonth(),
              now.getDate()
            );
            query = query.gte("birth_date", minBirthDate.toISOString());
          }
        }
      }

      // Add pagination
      query = query.range(offset, offset + limit - 1);

      // Execute the query
      const { data, error, count } = await query;

      if (error) {
        logger.error("Error fetching profiles:", error);
        throw new AppError(error.message, 400);
      }

      // Transform the data to match the expected interface
      const profilesWithDetails = data.map((item) => {
        // Extract user data and profile data
        const { user, ...profileData } = item;

        // Format age if birth_date exists
        let age: number | undefined = undefined;
        if (profileData.birth_date) {
          const birthDate = new Date(profileData.birth_date);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();

          // Adjust age if birthday hasn't occurred yet this year
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }

        return {
          ...profileData,
          age,
          user: Array.isArray(user) ? user[0] : user,
        };
      });

      return {
        profiles: profilesWithDetails as ProfileWithUserDetails[],
        total: count || 0,
      };
    } catch (error) {
      logger.error("Error in getProfiles service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch profiles", 500);
    }
  }
}
