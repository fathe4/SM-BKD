/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable indent */
// src/services/searchService.ts
import { supabase } from "../config/supabase";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { BasicUserProfile, getUserBasicProfile } from "../utils/profileUtils";

interface SearchOptions {
  page?: number;
  limit?: number;
  sortBy?: "relevance" | "name" | "newest";
}

interface AdvancedSearchParams {
  query?: string;
  location?: string;
  interests?: string[];
  ageRange?: {
    min?: number;
    max?: number;
  };
  sortBy?: "relevance" | "name" | "newest";
  page?: number;
  limit?: number;
}

interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export class SearchService {
  static searchUsersNearby(
    userId: string,
    radius: number,
    arg2: { page: number; limit: number }
  ) {
    throw new Error("Method not implemented.");
  }
  /**
   * Search for users by username, first name, or last name
   */
  static async searchUsers(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult<BasicUserProfile>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const offset = (page - 1) * limit;

      if (!query.trim()) {
        throw new AppError("Search query cannot be empty", 400);
      }

      // Prepare the search query
      let dbQuery = supabase
        .from("users")
        .select(
          "id, username, first_name, last_name, profile_picture, bio, location, is_verified",
          { count: "exact" }
        )
        .or(
          `username.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`
        )
        .eq("is_active", true)
        .range(offset, offset + limit - 1);

      // Apply sorting if provided
      if (options.sortBy) {
        switch (options.sortBy) {
          case "name":
            dbQuery = dbQuery.order("first_name", { ascending: true });
            break;
          case "newest":
            dbQuery = dbQuery.order("created_at", { ascending: false });
            break;
          // For "relevance", no specific ordering needed as Postgres will sort by relevance
        }
      }

      const { data, error, count } = await dbQuery;

      if (error) {
        logger.error("Error searching users:", error);
        throw new AppError(error.message, 400);
      }

      return {
        data: data as BasicUserProfile[],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
        limit,
      };
    } catch (error) {
      logger.error("Error in searchUsers service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to search users", 500);
    }
  }

  /**
   * Advanced search for users with multiple criteria
   */
  static async advancedUserSearch(
    params: AdvancedSearchParams
  ): Promise<SearchResult<BasicUserProfile>> {
    try {
      const page = params.page || 1;
      const limit = params.limit || 10;
      const offset = (page - 1) * limit;

      // Build the advanced search query
      let dbQuery = supabase
        .from("users")
        .select(
          `
          id, 
          username, 
          first_name, 
          last_name, 
          profile_picture, 
          bio, 
          location, 
          is_verified,
          profiles!inner(
            birth_date,
            location,
            interests,
            coordinates
          )
          `,
          { count: "exact" }
        )
        .eq("is_active", true);

      // Apply text search if provided
      if (params.query && params.query.trim()) {
        dbQuery = dbQuery.or(
          `username.ilike.%${params.query}%,first_name.ilike.%${params.query}%,last_name.ilike.%${params.query}%`
        );
      }

      // Apply location filter if provided
      if (params.location && params.location.trim()) {
        dbQuery = dbQuery.or(
          `location.ilike.%${params.location}%,profiles.location.ilike.%${params.location}%`
        );
      }

      // Apply age range filter if provided
      if (params.ageRange) {
        const now = new Date();

        if (params.ageRange.min !== undefined) {
          // Calculate maximum birth date for minimum age
          const maxBirthYear = now.getFullYear() - params.ageRange.min;
          const maxBirthDate = new Date(
            maxBirthYear,
            now.getMonth(),
            now.getDate()
          );
          dbQuery = dbQuery.lte(
            "profiles.birth_date",
            maxBirthDate.toISOString()
          );
        }

        if (params.ageRange.max !== undefined) {
          // Calculate minimum birth date for maximum age
          const minBirthYear = now.getFullYear() - params.ageRange.max;
          const minBirthDate = new Date(
            minBirthYear,
            now.getMonth(),
            now.getDate()
          );
          dbQuery = dbQuery.gte(
            "profiles.birth_date",
            minBirthDate.toISOString()
          );
        }
      }

      // Apply interests filter if provided
      if (params.interests && params.interests.length > 0) {
        // We need to match users who have ANY of the interests
        params.interests.forEach((interest) => {
          dbQuery = dbQuery.or(
            `profiles.interests->categories.cs.{${interest}},profiles.interests->tags.cs.{${interest}}`
          );
        });
      }

      // Apply sorting
      if (params.sortBy) {
        switch (params.sortBy) {
          case "name":
            dbQuery = dbQuery.order("first_name", { ascending: true });
            break;
          case "newest":
            dbQuery = dbQuery.order("created_at", { ascending: false });
            break;
          // For "relevance", no specific ordering needed
        }
      }

      // Apply pagination
      dbQuery = dbQuery.range(offset, offset + limit - 1);

      const { data, error, count } = await dbQuery;

      if (error) {
        logger.error("Error in advanced user search:", error);
        throw new AppError(error.message, 400);
      }

      // Transform the results to match the BasicUserProfile structure
      const users = data.map((item) => {
        // Extract user data, excluding the profiles property
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { profiles, ...userData } = item;
        return userData as BasicUserProfile;
      });

      return {
        data: users,
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
        limit,
      };
    } catch (error) {
      logger.error("Error in advancedUserSearch service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to perform advanced user search", 500);
    }
  }

  /**
   * Search for users near a specific location
   */
  //   static async searchUsersNearby(
  //     userId: string,
  //     radiusKm: number = 10,
  //     options: SearchOptions = {}
  //   ): Promise<SearchResult<BasicUserProfile>> {
  //     try {
  //       const page = options.page || 1;
  //       const limit = options.limit || 10;
  //       const offset = (page - 1) * limit;

  //       // First, get the user's location
  //       const { data: userLocation, error: locationError } = await supabase
  //         .from("user_locations")
  //         .select("coordinates")
  //         .eq("user_id", userId)
  //         .eq("is_active", true)
  //         .order("created_at", { ascending: false })
  //         .limit(1)
  //         .single();

  //       if (locationError && locationError.code !== "PGRST116") {
  //         logger.error("Error fetching user location:", locationError);
  //         throw new AppError(locationError.message, 400);
  //       }

  //       if (!userLocation || !userLocation.coordinates) {
  //         throw new AppError("User location not found", 404);
  //       }

  //       // Parse the coordinates from PostGIS POINT format or use provided coordinates
  //       let coordinates = { longitude: 0, latitude: 0 };

  //       if (typeof userLocation.coordinates === "string") {
  //         // If it's a string like "POINT(longitude latitude)", parse it
  //         const match = userLocation.coordinates.match(
  //           /POINT\(([^ ]+) ([^)]+)\)/i
  //         );
  //         if (match) {
  //           coordinates = {
  //             longitude: parseFloat(match[1]),
  //             latitude: parseFloat(match[2]),
  //           };
  //         }
  //       } else if (typeof userLocation.coordinates === "object") {
  //         // If it's already an object, use it directly
  //         coordinates = userLocation.coordinates;
  //       }

  //       // Now find users within the radius
  //       // For PostGIS, we need to use the ST_DWithin function
  //       const { data, error, count } = await supabase
  //         .from("user_locations")
  //         .select(
  //           `
  //           user_id,
  //           users!inner(
  //             id,
  //             username,
  //             first_name,
  //             last_name,
  //             profile_picture,
  //             bio,
  //             location,
  //             is_verified
  //           )
  //           `,
  //           { count: "exact" }
  //         )
  //         .neq("user_id", userId) // Exclude the requesting user
  //         .eq("is_active", true)
  //         .filter(
  //           "ST_DWithin(coordinates, ST_MakePoint($1, $2)::geography, $3)",
  //           [
  //             userLocation.coordinates.longitude || 0,
  //             userLocation.coordinates.latitude || 0,
  //             radiusKm * 1000,
  //           ]
  //         )
  //         .range(offset, offset + limit - 1);

  //       if (error) {
  //         logger.error("Error searching users nearby:", error);
  //         throw new AppError(error.message, 400);
  //       }

  //       // Transform the results to match the BasicUserProfile structure
  //       const users = data.map((item) => {
  //         return item.users as unknown as BasicUserProfile;
  //       });

  //       return {
  //         data: users,
  //         total: count || 0,
  //         page,
  //         totalPages: Math.ceil((count || 0) / limit),
  //         limit,
  //       };
  //     } catch (error) {
  //       logger.error("Error in searchUsersNearby service:", error);
  //       throw error instanceof AppError
  //         ? error
  //         : new AppError("Failed to search users nearby", 500);
  //     }
  //   }
}
