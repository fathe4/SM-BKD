import { supabase, supabaseAdmin } from "../config/supabase";
import {
  User,
  Profile,
  Friendship,
  UserDevice,
  UserLocation,
} from "../types/models";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

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
    status: "accepted" | "rejected" | "blocked"
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
    deviceData: Omit<UserDevice, "id" | "created_at">
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
   * Track a user's location
   */
  static async trackUserLocation(
    locationData: Omit<UserLocation, "id" | "created_at">
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
}
