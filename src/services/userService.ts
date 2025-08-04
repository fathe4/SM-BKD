import { supabase, supabaseAdmin } from "../config/supabase";
import {
  User,
  Profile,
  Friendship,
  UserDevice,
  UserLocation,
  UserRole,
} from "../types/models";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import { StorageService } from "./storageService";
import { FileUploadResult } from "../types/storage";

/**
 * Service class for user-related database operations
 */
export class UserService {
  /**
   * Create a new user
   */
  static async createUser(
    userData: Omit<User, "id" | "created_at" | "updated_at">
  ): Promise<User> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("users")
        .insert(userData)
        .select()
        .single();

      if (error) {
        logger.error("Error creating user:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in createUser:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create user", 500);
    }
  }

  /**
   * Find a user by username with profile data in a single query
   */
  static async findUserByUsernameWithProfile(
    username: string
  ): Promise<any | null> {
    try {
      // Find the user and their profile in a single query
      const { data, error } = await supabase
        .from("users")
        .select(
          `
            id, 
            username, 
            first_name, 
            last_name, 
            profile_picture, 
            cover_picture, 
            bio, 
            location, 
            is_verified,
            profiles(*)
          `
        )
        .eq("username", username)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No user found
          return null;
        }
        logger.error("Error finding user by username:", error);
        throw new AppError(error.message, 400);
      }

      // Transform the response to have a cleaner structure
      const { profiles, ...userInfo } = data;

      return {
        user: userInfo,
        profile: profiles && profiles.length > 0 ? profiles[0] : null,
      };
    } catch (error) {
      logger.error("Error in findUserByUsernameWithProfile:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user by username", 500);
    }
  }

  /**
   * Find a user by email
   */
  static async findUserByEmail(email: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is the error code for "no rows returned"
        logger.error("Error finding user by email:", error);
        throw new AppError(error.message, 400);
      }

      return data as User | null;
    } catch (error) {
      logger.error("Error in findUserByEmail:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user", 500);
    }
  }

  /**
   * Find a user by username
   */
  static async findUserByUsername(username: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Error finding user by username:", error);
        throw new AppError(error.message, 400);
      }

      return data as User | null;
    } catch (error) {
      logger.error("Error in findUserByUsername:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user", 500);
    }
  }

  /**
   * Find a user by ID
   */
  static async findUserById(id: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Error finding user by ID:", error);
        throw new AppError(error.message, 400);
      }

      return data as User | null;
    } catch (error) {
      logger.error("Error in findUserById:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user", 500);
    }
  }

  /**
   * Update a user
   */
  static async updateUser(id: string, userData: Partial<User>): Promise<User> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update(userData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logger.error("Error updating user:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updateUser:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update user", 500);
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
      logger.error("Error in upsertProfile:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create/update profile", 500);
    }
  }

  /**
   * Get a user's profile
   */
  static async getProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Error fetching profile:", error);
        throw new AppError(error.message, 400);
      }

      return data as Profile | null;
    } catch (error) {
      logger.error("Error in getProfile:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch profile", 500);
    }
  }

  /**
   * Create a friendship request
   */
  static async createFriendship(
    requesterId: string,
    addresseeId: string
  ): Promise<Friendship> {
    try {
      // Check if a friendship already exists in either direction
      const { data: existingFriendship, error: checkError } = await supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${requesterId},addressee_id.eq.${requesterId}`)
        .or(`requester_id.eq.${addresseeId},addressee_id.eq.${addresseeId}`)
        .maybeSingle();

      if (checkError) {
        logger.error("Error checking friendship existence:", checkError);
        throw new AppError(checkError.message, 400);
      }

      if (existingFriendship) {
        throw new AppError(
          "A friendship already exists between these users",
          400
        );
      }

      const { data, error } = await supabaseAdmin!
        .from("friendships")
        .insert({
          requester_id: requesterId,
          addressee_id: addresseeId,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating friendship:", error);
        throw new AppError(error.message, 400);
      }

      return data as Friendship;
    } catch (error) {
      logger.error("Error in createFriendship:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create friendship", 500);
    }
  }

  /**
   * Update a friendship status
   */
  static async updateFriendshipStatus(
    friendshipId: string,
    status: "pending" | "accepted" | "rejected" | "blocked"
  ): Promise<Friendship> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("friendships")
        .update({ status })
        .eq("id", friendshipId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating friendship:", error);
        throw new AppError(error.message, 400);
      }

      return data as Friendship;
    } catch (error) {
      logger.error("Error in updateFriendshipStatus:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update friendship", 500);
    }
  }

  /**
   * Register a user device
   */
  static async registerUserDevice(
    deviceData: Omit<UserDevice, "id" | "created_at" | "updated_at">
  ): Promise<UserDevice> {
    try {
      // Check if device already exists
      const { data: existingDevice, error: checkError } = await supabase
        .from("user_devices")
        .select("*")
        .eq("user_id", deviceData.user_id)
        .eq("device_token", deviceData.device_token)
        .maybeSingle();

      if (checkError) {
        logger.error("Error checking device existence:", checkError);
        throw new AppError(checkError.message, 400);
      }

      let result;

      if (existingDevice) {
        // Update existing device
        const { data, error } = await supabaseAdmin!
          .from("user_devices")
          .update({
            ...deviceData,
            last_active: new Date().toISOString(),
          })
          .eq("id", existingDevice.id)
          .select()
          .single();

        if (error) {
          logger.error("Error updating device:", error);
          throw new AppError(error.message, 400);
        }

        result = data;
      } else {
        // Create new device
        const { data, error } = await supabaseAdmin!
          .from("user_devices")
          .insert(deviceData)
          .select()
          .single();

        if (error) {
          logger.error("Error creating device:", error);
          throw new AppError(error.message, 400);
        }

        result = data;
      }

      return result as UserDevice;
    } catch (error) {
      logger.error("Error in registerUserDevice:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to register device", 500);
    }
  }

  /**
   * Update a user device
   */
  static async updateUserDevice(
    userId: string,
    deviceToken: string,
    updateData: Partial<
      Omit<UserDevice, "id" | "user_id" | "device_token" | "created_at">
    >
  ): Promise<UserDevice | null> {
    try {
      // Find the device first
      const { data: existingDevice, error: findError } = await supabase
        .from("user_devices")
        .select("*")
        .eq("user_id", userId)
        .eq("device_token", deviceToken)
        .maybeSingle();

      if (findError) {
        logger.error("Error finding device:", findError);
        throw new AppError(findError.message, 400);
      }

      if (!existingDevice) {
        logger.warn(
          `Device not found for user ${userId} with token ${deviceToken}`
        );
        return null;
      }

      // Update the device
      const { data, error } = await supabaseAdmin!
        .from("user_devices")
        .update(updateData)
        .eq("id", existingDevice.id)
        .select()
        .single();

      if (error) {
        logger.error("Error updating device:", error);
        throw new AppError(error.message, 400);
      }

      return data as UserDevice;
    } catch (error) {
      logger.error("Error in updateUserDevice:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update device", 500);
    }
  }

  /**
   * Track a user's location
   */
  static async trackUserLocation(
    locationData: Omit<UserLocation, "id" | "created_at" | "updated_at">
  ): Promise<UserLocation> {
    try {
      // Format coordinates for PostGIS
      const coordinates = locationData.coordinates;
      const point = `POINT(${coordinates[0]} ${coordinates[1]})`;

      // Create the location record
      const { data, error } = await supabaseAdmin!
        .from("user_locations")
        .insert({
          ...locationData,
          coordinates: point,
        })
        .select()
        .single();

      if (error) {
        logger.error("Error tracking location:", error);
        throw new AppError(error.message, 400);
      }

      return data as UserLocation;
    } catch (error) {
      logger.error("Error in trackUserLocation:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to track location", 500);
    }
  }
  // src/services/userService.ts (add these methods to your existing UserService class)

  /**
   * Update a user's profile picture
   */
  static async updateProfilePicture(
    userId: string,
    fileResult: FileUploadResult
  ): Promise<User> {
    try {
      // Get the current user to check if they have an existing profile picture
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Extract the file path from the existing profile picture URL if it exists
      let oldPicturePath: string | null = null;
      if (currentUser.profile_picture) {
        // Example profile_picture URL: https://xxxx.supabase.co/storage/v1/object/public/profile-pictures/folder/filename.jpg
        // We need to extract 'folder/filename.jpg' part
        const urlParts = currentUser.profile_picture.split("/public/");
        if (urlParts.length > 1) {
          const bucketAndPath = urlParts[1].split("/");
          if (bucketAndPath.length > 1) {
            // Remove the bucket name from the path
            bucketAndPath.shift();
            oldPicturePath = bucketAndPath.join("/");
          }
        }
      }

      // Update user with new profile picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({
          profile_picture: fileResult.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating profile picture:", error);
        throw new AppError(error.message, 400);
      }

      // If there was an old picture and the update was successful, we can delete the old one
      if (oldPicturePath) {
        try {
          await StorageService.deleteFile("profile-pictures", oldPicturePath);
        } catch (deleteError) {
          // Log the error but don't fail the whole operation
          logger.warn("Failed to delete old profile picture:", deleteError);
        }
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updateProfilePicture:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update profile picture", 500);
    }
  }

  /**
   * Remove a user's profile picture
   */
  static async removeProfilePicture(userId: string): Promise<User> {
    try {
      // Get the current user to check if they have an existing profile picture
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Extract the file path from the existing profile picture URL if it exists
      let picturePath: string | null = null;
      if (currentUser.profile_picture) {
        // Extract path similar to the method above
        const urlParts = currentUser.profile_picture.split("/public/");
        if (urlParts.length > 1) {
          const bucketAndPath = urlParts[1].split("/");
          if (bucketAndPath.length > 1) {
            bucketAndPath.shift();
            picturePath = bucketAndPath.join("/");
          }
        }
      } else {
        // No profile picture to remove
        return currentUser;
      }

      // Update user to remove profile picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({ profile_picture: null, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error removing profile picture:", error);
        throw new AppError(error.message, 400);
      }

      // Delete the file from storage
      if (picturePath) {
        try {
          await StorageService.deleteFile("profile-pictures", picturePath);
        } catch (deleteError) {
          // Log the error but don't fail the whole operation
          logger.warn("Failed to delete profile picture file:", deleteError);
        }
      }

      return data as User;
    } catch (error) {
      logger.error("Error in removeProfilePicture:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to remove profile picture", 500);
    }
  }

  /**
   * Delete a user
   */
  static async deleteUser(id: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin!
        .from("users")
        .delete()
        .eq("id", id);

      if (error) {
        logger.error("Error deleting user:", error);
        throw new AppError(error.message, 400);
      }
    } catch (error) {
      logger.error("Error in deleteUser:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete user", 500);
    }
  }

  /**
   * Get users with pagination, filtering and search
   */
  static async getUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    role?: UserRole;
    is_verified?: boolean;
    is_active?: boolean;
    sort_by?: string;
    order?: "asc" | "desc";
  }): Promise<{ users: User[]; total: number }> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        role,
        is_verified,
        is_active,
        sort_by = "created_at",
        order = "desc",
      } = options;

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Start building the query
      let query = supabase.from("users").select("*", { count: "exact" });

      // Apply search filter if provided
      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%`
        );
      }

      // Apply role filter if provided
      if (role) {
        query = query.eq("role", role);
      }

      // Apply verification filter if provided
      if (is_verified !== undefined) {
        query = query.eq("is_verified", is_verified);
      }

      // Apply active status filter if provided
      if (is_active !== undefined) {
        query = query.eq("is_active", is_active);
      }

      // Apply sorting
      query = query.order(sort_by, { ascending: order === "asc" });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      // Execute the query
      const { data, error, count } = await query;

      if (error) {
        logger.error("Error fetching users:", error);
        throw new AppError(error.message, 400);
      }

      return {
        users: data as User[],
        total: count || 0,
      };
    } catch (error) {
      logger.error("Error in getUsers:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch users", 500);
    }
  }

  // Add these methods to your UserService class in src/services/userService.ts

  /**
   * Update a user's profile picture URL
   */
  static async updateProfilePictureUrl(
    userId: string,
    pictureUrl: string
  ): Promise<User> {
    try {
      // Get the current user to check if they exist
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Update user with new profile picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({
          profile_picture: pictureUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating profile picture URL:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updateProfilePictureUrl:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update profile picture URL", 500);
    }
  }

  /**
   * Remove a user's profile picture URL
   */
  static async removeProfilePictureUrl(userId: string): Promise<User> {
    try {
      // Get the current user to check if they exist
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // If there's no profile picture, nothing to remove
      if (!currentUser.profile_picture) {
        return currentUser;
      }

      // Update user to remove profile picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({ profile_picture: null, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error removing profile picture URL:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in removeProfilePictureUrl:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to remove profile picture URL", 500);
    }
  }

  /**
   * Update a user's cover picture URL
   */
  static async updateCoverPictureUrl(
    userId: string,
    pictureUrl: string
  ): Promise<User> {
    try {
      // Get the current user to check if they exist
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // Update user with new cover picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({
          cover_picture: pictureUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating cover picture URL:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updateCoverPictureUrl:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update cover picture URL", 500);
    }
  }

  /**
   * Remove a user's cover picture URL
   */
  static async removeCoverPictureUrl(userId: string): Promise<User> {
    try {
      // Get the current user to check if they exist
      const currentUser = await this.findUserById(userId);

      if (!currentUser) {
        throw new AppError("User not found", 404);
      }

      // If there's no cover picture, nothing to remove
      if (!currentUser.cover_picture) {
        return currentUser;
      }

      // Update user to remove cover picture URL
      const { data, error } = await supabaseAdmin!
        .from("users")
        .update({ cover_picture: null, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error removing cover picture URL:", error);
        throw new AppError(error.message, 400);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in removeCoverPictureUrl:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to remove cover picture URL", 500);
    }
  }
}
