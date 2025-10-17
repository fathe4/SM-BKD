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
import { redisService } from "./redis.service";
import bcrypt from "bcryptjs";

interface UserProfile {
  location: string | null;
  coordinates: any;
  interests: string[];
  birth_date: string | null;
  occupation: string | null;
  education: string | null;
  relationship_status: string | null;
}

interface MarketplaceStats {
  isActive: boolean;
  activeListingsCount: number;
  totalListingsCount: number;
  averageRating: number | null;
  totalRatings: number;
  recentListings: any[];
}

interface SubscriptionDetails {
  tier: any;
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

interface UserWithDetails {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  profile: UserProfile | null;
  location: {
    current: UserLocation | null;
    profile: string | null;
  };
  marketplace: MarketplaceStats;
  subscription: SubscriptionDetails;
  stats: {
    totalListings: number;
    activeListings: number;
    totalRatings: number;
    averageRating: number | null;
  };
}

interface DetailOptions {
  includeProfile?: boolean;
  includeLocation?: boolean;
  includeMarketplace?: boolean;
  includeSubscription?: boolean;
  marketplaceLimit?: number;
}

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
   * Consolidated user creation with validation and optional profile
   * Used by both auth registration and admin user creation
   */
  static async createUserWithValidation(userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    username: string;
    role?: UserRole;
    is_verified?: boolean;
    is_active?: boolean;
    settings?: Record<string, any>;
    profile?: {
      location?: string;
      coordinates?: [number, number];
      interests?: string[];
      birth_date?: string;
      occupation?: string;
      education?: string;
      relationship_status?: string;
    };
  }): Promise<{ user: User; profile?: Profile }> {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        username,
        role = UserRole.USER,
        is_verified = false,
        is_active = true,
        settings,
        profile: profileData,
        ...rest
      } = userData;

      // Check if user already exists
      const existingUser = await UserService.findUserByEmail(email);
      if (existingUser) {
        throw new AppError("Email already in use", 400);
      }

      // Check if username is taken
      const existingUsername = await UserService.findUserByUsername(username);
      if (existingUsername) {
        throw new AppError("Username already taken", 400);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await UserService.createUser({
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        username,
        role,
        is_verified,
        is_active,
        settings,
        ...rest,
      });

      let profile: Profile | undefined;

      // Create profile if profile data is provided
      if (profileData) {
        profile = await UserService.upsertProfile({
          user_id: newUser.id,
          ...profileData,
        });
      }

      return {
        user: newUser,
        profile,
      };
    } catch (error) {
      logger.error("Error in createUserWithValidation:", error);
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
  // static async findUserById(id: string): Promise<User | null> {
  //   try {
  //     const { data, error } = await supabase
  //       .from("users")
  //       .select("*")
  //       .eq("id", id)
  //       .single();

  //     if (error && error.code !== "PGRST116") {
  //       logger.error("Error finding user by ID:", error);
  //       throw new AppError(error.message, 400);
  //     }

  //     return data as User | null;
  //   } catch (error) {
  //     logger.error("Error in findUserById:", error);
  //     throw error instanceof AppError
  //       ? error
  //       : new AppError("Failed to find user", 500);
  //   }
  // }

  static async findUserById(id: string): Promise<User | null> {
    try {
      const cacheKey = redisService.keys.userBasic(id);
      const cached = await redisService.get<User>(cacheKey);

      if (cached) {
        return cached;
      }

      const { data, error } = await supabase
        .from("users")
        .select(
          "id, email, password_hash, first_name, last_name, username, profile_picture, cover_picture, bio, location, contact_info, role, is_verified, is_active, created_at, updated_at"
        )
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Error finding user by ID:", error);
        throw new AppError(error.message, 400);
      }

      if (data) {
        await redisService.set(
          cacheKey,
          data,
          redisService.getTTL().USER_BASIC
        );
      }

      return data;
    } catch (error) {
      logger.error("Error in findUserById:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user", 500);
    }
  }

  // Get user profile information
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "location, coordinates, interests, birth_date, occupation, education, relationship_status"
        )
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        logger.error("Error getting user profile:", error);
        throw new AppError(error.message, 400);
      }

      return data;
    } catch (error) {
      logger.error("Error in getUserProfile:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get user profile", 500);
    }
  }

  // Get current and profile location data
  static async getUserLocation(userId: string): Promise<{
    current: UserLocation | null;
    profile: string | null;
  }> {
    try {
      // Get current active location
      const { data: locationData, error: locationError } = await supabase
        .from("user_locations")
        .select(
          "id, user_id, device_id, coordinates, city, country, ip_address, accuracy, is_active, location_source, additional_metadata, created_at"
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get profile location
      const { data: profileData } = await supabase
        .from("profiles")
        .select("location")
        .eq("user_id", userId)
        .single();

      if (locationError && locationError.code !== "PGRST116") {
        logger.error("Error getting user location:", locationError);
      }

      const current = locationData
        ? {
            id: locationData.id || "",
            user_id: userId,
            device_id: locationData.device_id || "",
            coordinates: locationData.coordinates,
            city: locationData.city,
            country: locationData.country,
            ip_address: locationData.ip_address,
            accuracy: locationData.accuracy,
            is_active: locationData.is_active,
            location_source: locationData.location_source,
            additional_metadata: locationData.additional_metadata,
            created_at: locationData.created_at,
            updated_at: locationData.created_at,
          }
        : null;

      return {
        current,
        profile: profileData?.location || null,
      };
    } catch (error) {
      logger.error("Error in getUserLocation:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get user location", 500);
    }
  }

  // Get marketplace statistics with caching
  static async getMarketplaceStats(
    userId: string,
    limit: number = 5
  ): Promise<MarketplaceStats> {
    try {
      const cacheKey = redisService.keys.userMarketplace(userId);
      const cached = await redisService.get<MarketplaceStats>(cacheKey);

      if (cached) {
        // Still get recent listings as they change frequently
        const { data: recentListings } = await supabase
          .from("marketplace_listings")
          .select(
            "id, title, status, approval_status, created_at, subscription_tier_id"
          )
          .eq("seller_id", userId)
          .eq("status", "active")
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false })
          .limit(limit);

        return { ...cached, recentListings: recentListings || [] };
      }

      // Get active listings count efficiently
      const { count: activeCount, error: activeError } = await supabase
        .from("marketplace_listings")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", userId)
        .eq("status", "active")
        .eq("approval_status", "approved");

      // Get total listings count
      const { count: totalCount, error: totalError } = await supabase
        .from("marketplace_listings")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", userId);

      // Get average rating using database function for better performance
      const { data: ratingData, error: ratingError } = await supabase.rpc(
        "get_seller_rating_stats",
        { seller_id: userId }
      );

      // Get recent listings
      const { data: recentListings, error: listingsError } = await supabase
        .from("marketplace_listings")
        .select(
          "id, title, status, approval_status, created_at, subscription_tier_id"
        )
        .eq("seller_id", userId)
        .eq("status", "active")
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (activeError || totalError || ratingError || listingsError) {
        logger.error("Error getting marketplace stats:", {
          activeError,
          totalError,
          ratingError,
          listingsError,
        });
        throw new AppError("Failed to get marketplace statistics", 400);
      }

      const stats: MarketplaceStats = {
        isActive: (activeCount || 0) > 0,
        activeListingsCount: activeCount || 0,
        totalListingsCount: totalCount || 0,
        averageRating: ratingData?.[0]?.average_rating || null,
        totalRatings: ratingData?.[0]?.total_ratings || 0,
        recentListings: recentListings || [],
      };

      // Cache stats without recent listings (they change too frequently)
      const statsToCache = { ...stats, recentListings: [] };
      await redisService.set(
        cacheKey,
        statsToCache,
        redisService.getTTL().USER_MARKETPLACE
      );

      return stats;
    } catch (error) {
      logger.error("Error in getMarketplaceStats:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get marketplace stats", 500);
    }
  }

  // Get subscription details with caching
  static async getSubscriptionDetails(
    userId: string
  ): Promise<SubscriptionDetails> {
    try {
      const cacheKey = redisService.keys.userSubscription(userId);
      const cached = await redisService.get<SubscriptionDetails>(cacheKey);

      if (cached) {
        return cached;
      }

      const { data } = await supabase
        .from("user_subscriptions")
        .select(
          `
          status,
          started_at,
          expires_at,
          subscription_tiers(
            name,
            description,
            price,
            duration_days,
            featured_listings,
            listing_limit,
            priority_search
          )
        `
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .single();

      const result: SubscriptionDetails = data
        ? {
            tier: data.subscription_tiers,
            status: data.status,
            startedAt: data.started_at,
            expiresAt: data.expires_at,
            isActive: true,
          }
        : {
            tier: null,
            status: "none",
            startedAt: null,
            expiresAt: null,
            isActive: false,
          };

      await redisService.set(
        cacheKey,
        result,
        redisService.getTTL().USER_SUBSCRIPTION
      );
      return result;
    } catch (error) {
      logger.error("Error in getSubscriptionDetails:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get subscription details", 500);
    }
  }

  // Main method with selective loading
  static async findUserByIdWithDetails(
    id: string,
    options: DetailOptions = {}
  ): Promise<UserWithDetails | null> {
    const {
      includeProfile = true,
      includeLocation = true,
      includeMarketplace = true,
      includeSubscription = true,
      marketplaceLimit = 5,
    } = options;

    try {
      // Always get basic user data
      const user = await this.findUserById(id);
      if (!user) {
        return null;
      }

      // Fetch details in parallel based on options
      const promises: Promise<any>[] = [];
      const results: any = {};

      if (includeProfile) {
        promises.push(
          this.getUserProfile(id).then(profile => {
            results.profile = profile;
          })
        );
      }

      if (includeLocation) {
        promises.push(
          this.getUserLocation(id).then(location => {
            results.location = location;
          })
        );
      }

      if (includeMarketplace) {
        promises.push(
          this.getMarketplaceStats(id, marketplaceLimit).then(marketplace => {
            results.marketplace = marketplace;
          })
        );
      }

      if (includeSubscription) {
        promises.push(
          this.getSubscriptionDetails(id).then(subscription => {
            results.subscription = subscription;
          })
        );
      }

      await Promise.all(promises);

      // Build response with defaults for non-included sections
      return {
        ...user,
        profile: results.profile || null,
        location: results.location || { current: null, profile: null },
        marketplace: results.marketplace || {
          isActive: false,
          activeListingsCount: 0,
          totalListingsCount: 0,
          averageRating: null,
          totalRatings: 0,
          recentListings: [],
        },
        subscription: results.subscription || {
          tier: null,
          status: "none",
          startedAt: null,
          expiresAt: null,
          isActive: false,
        },
        stats: {
          totalListings: results.marketplace?.totalListingsCount || 0,
          activeListings: results.marketplace?.activeListingsCount || 0,
          totalRatings: results.marketplace?.totalRatings || 0,
          averageRating: results.marketplace?.averageRating || null,
        },
      };
    } catch (error) {
      logger.error("Error in findUserByIdWithDetails:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find user with details", 500);
    }
  }

  // Cache invalidation methods
  static async invalidateUserCache(userId: string): Promise<void> {
    try {
      await Promise.all([
        redisService.delete(redisService.keys.userBasic(userId)),
        redisService.delete(redisService.keys.userMarketplace(userId)),
        redisService.delete(redisService.keys.userSubscription(userId)),
      ]);
    } catch (error) {
      logger.error("Error invalidating user cache:", error);
    }
  }

  // Batch user loading for list views
  static async findUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];

    try {
      const { data, error } = await supabase
        .from("users")
        .select(
          "id, email, password_hash, first_name, last_name, username, profile_picture, cover_picture, bio, location, contact_info, role, is_verified, is_active, created_at, updated_at"
        )
        .in("id", ids);

      if (error) {
        logger.error("Error finding users by IDs:", error);
        throw new AppError(error.message, 400);
      }

      return data || [];
    } catch (error) {
      logger.error("Error in findUsersByIds:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to find users", 500);
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
  /**
   * Delete a user and all associated data
   * This is a comprehensive deletion that handles all foreign key relationships
   */
  static async deleteUserCompletely(id: string): Promise<void> {
    try {
      // First, verify the user exists
      const user = await this.findUserById(id);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      logger.info(`Starting complete deletion for user: ${id}`);

      // Start a transaction-like approach by deleting in the correct order
      // to avoid foreign key constraint violations

      // 1. Clean up user files (profile pictures, cover pictures, etc.)
      await this.cleanupUserFiles(user);

      // 2. Delete user-specific data that doesn't reference other users
      await this.deleteUserSpecificData(id);

      // 3. Delete data where user is referenced by other users
      await this.deleteUserReferencedData(id);

      // 4. Finally delete the user record
      await this.deleteUserRecord(id);

      // 5. Clean up any cached data
      await this.invalidateUserCache(id);

      logger.info(`Successfully deleted user and all associated data: ${id}`);
    } catch (error) {
      logger.error("Error in deleteUserCompletely:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete user completely", 500);
    }
  }

  /**
   * Clean up user files (profile pictures, cover pictures, etc.)
   */
  private static async cleanupUserFiles(user: User): Promise<void> {
    try {
      const filesToDelete: string[] = [];

      // Add profile picture if exists
      if (user.profile_picture) {
        filesToDelete.push(user.profile_picture);
      }

      // Add cover picture if exists
      if (user.cover_picture) {
        filesToDelete.push(user.cover_picture);
      }

      // Delete files from storage
      for (const filePath of filesToDelete) {
        try {
          // Extract bucket name from file path or use default
          const bucketName = filePath.includes("profile-pictures")
            ? "profile-pictures"
            : filePath.includes("cover-pictures")
            ? "cover-pictures"
            : "post-media";
          await StorageService.deleteFile(bucketName, filePath);
          logger.debug(`Deleted file: ${filePath}`);
        } catch (error) {
          logger.warn(`Failed to delete file ${filePath}:`, error);
          // Continue with other files even if one fails
        }
      }

      // Also clean up any post media files
      await this.cleanupUserPostMedia(user.id);
    } catch (error) {
      logger.warn("Error cleaning up user files:", error);
      // Don't throw error here as file cleanup is not critical
    }
  }

  /**
   * Clean up media files associated with user's posts
   */
  private static async cleanupUserPostMedia(userId: string): Promise<void> {
    try {
      // Get all posts by the user
      const { data: posts, error: postsError } = await supabaseAdmin!
        .from("posts")
        .select("id, media")
        .eq("user_id", userId);

      if (postsError) {
        logger.warn("Error fetching user posts for media cleanup:", postsError);
        return;
      }

      if (!posts) return;

      // Extract media URLs from posts
      const mediaUrls: string[] = [];
      for (const post of posts) {
        if (post.media && typeof post.media === "object") {
          const media = post.media as any;
          if (Array.isArray(media)) {
            media.forEach((item: any) => {
              if (item.url) mediaUrls.push(item.url);
            });
          } else if (media.url) {
            mediaUrls.push(media.url);
          }
        }
      }

      // Delete media files
      for (const mediaUrl of mediaUrls) {
        try {
          await StorageService.deleteFile("post-media", mediaUrl);
          logger.debug(`Deleted post media: ${mediaUrl}`);
        } catch (error) {
          logger.warn(`Failed to delete post media ${mediaUrl}:`, error);
        }
      }
    } catch (error) {
      logger.warn("Error cleaning up user post media:", error);
    }
  }

  /**
   * Delete user-specific data (data that belongs only to this user)
   */
  private static async deleteUserSpecificData(userId: string): Promise<void> {
    const tables = [
      "user_devices",
      "user_locations",
      "user_privacy_settings",
      "user_subscriptions",
      "profiles",
      "save_collections",
      "saved_items",
      "posts",
      "comments",
      "stories",
      "story_views",
      "reactions",
      "notifications",
      "payments",
      "invoices",
      "post_boosts",
      "marketplace_listings",
      "seller_ratings",
      "reports",
    ];

    for (const table of tables) {
      try {
        const { error } = await supabaseAdmin!
          .from(table)
          .delete()
          .eq("user_id", userId);

        if (error) {
          logger.warn(`Error deleting from ${table}:`, error);
          // Continue with other tables even if one fails
        } else {
          logger.debug(`Deleted data from ${table} for user ${userId}`);
        }
      } catch (error) {
        logger.warn(`Exception deleting from ${table}:`, error);
      }
    }
  }

  /**
   * Delete data where user is referenced by other users
   */
  private static async deleteUserReferencedData(userId: string): Promise<void> {
    // Delete friendships where user is either requester or addressee
    await this.deleteUserFriendships(userId);

    // Delete chat participants
    await this.deleteUserChatParticipants(userId);

    // Delete group memberships
    await this.deleteUserGroupMemberships(userId);

    // Delete page followers
    await this.deleteUserPageFollowers(userId);

    // Delete chats created by user
    await this.deleteUserCreatedChats(userId);

    // Delete groups created by user
    await this.deleteUserCreatedGroups(userId);

    // Delete pages created by user
    await this.deleteUserCreatedPages(userId);

    // Update marketplace listings approved by user (set to null)
    await this.updateMarketplaceListingsApprovedBy(userId);

    // Delete reactions where user is the actor
    await this.deleteUserReactions(userId);

    // Delete notifications where user is the actor
    await this.deleteUserActorNotifications(userId);

    // Delete reports where user is the reporter
    await this.deleteUserReports(userId);

    // Delete seller ratings where user is rater or seller
    await this.deleteUserSellerRatings(userId);
  }

  /**
   * Delete user record from users table
   */
  private static async deleteUserRecord(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) {
      logger.error("Error deleting user record:", error);
      throw new AppError(error.message, 400);
    }
  }

  // Helper methods for specific deletions
  private static async deleteUserFriendships(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("friendships")
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error) {
      logger.warn("Error deleting friendships:", error);
    }
  }

  private static async deleteUserChatParticipants(
    userId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("chat_participants")
      .delete()
      .eq("user_id", userId);

    if (error) {
      logger.warn("Error deleting chat participants:", error);
    }
  }

  private static async deleteUserGroupMemberships(
    userId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("group_members")
      .delete()
      .eq("user_id", userId);

    if (error) {
      logger.warn("Error deleting group memberships:", error);
    }
  }

  private static async deleteUserPageFollowers(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("page_followers")
      .delete()
      .eq("user_id", userId);

    if (error) {
      logger.warn("Error deleting page followers:", error);
    }
  }

  private static async deleteUserCreatedChats(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("chats")
      .delete()
      .eq("creator_id", userId);

    if (error) {
      logger.warn("Error deleting created chats:", error);
    }
  }

  private static async deleteUserCreatedGroups(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("groups")
      .delete()
      .eq("creator_id", userId);

    if (error) {
      logger.warn("Error deleting created groups:", error);
    }
  }

  private static async deleteUserCreatedPages(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("pages")
      .delete()
      .eq("creator_id", userId);

    if (error) {
      logger.warn("Error deleting created pages:", error);
    }
  }

  private static async updateMarketplaceListingsApprovedBy(
    userId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("marketplace_listings")
      .update({ approved_by: null })
      .eq("approved_by", userId);

    if (error) {
      logger.warn("Error updating marketplace listings approved_by:", error);
    }
  }

  private static async deleteUserReactions(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("reactions")
      .delete()
      .eq("user_id", userId);

    if (error) {
      logger.warn("Error deleting user reactions:", error);
    }
  }

  private static async deleteUserActorNotifications(
    userId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("notifications")
      .delete()
      .eq("actor_id", userId);

    if (error) {
      logger.warn("Error deleting actor notifications:", error);
    }
  }

  private static async deleteUserReports(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("reports")
      .delete()
      .eq("reporter_id", userId);

    if (error) {
      logger.warn("Error deleting user reports:", error);
    }
  }

  private static async deleteUserSellerRatings(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from("seller_ratings")
      .delete()
      .or(`rater_id.eq.${userId},seller_id.eq.${userId}`);

    if (error) {
      logger.warn("Error deleting seller ratings:", error);
    }
  }

  /**
   * Simple user deletion (legacy method - kept for backward compatibility)
   * Note: This may fail due to foreign key constraints
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

  /**
   * Admin service: Create user with profile in one operation
   */
  static async createUserWithProfile(userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    username: string;
    role?: UserRole;
    profile?: {
      location?: string;
      coordinates?: [number, number];
      interests?: string[];
      birth_date?: string;
      occupation?: string;
      education?: string;
      relationship_status?: string;
    };
  }): Promise<{ user: User; profile?: Profile }> {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        username,
        role = UserRole.USER,
        profile: profileData,
        ...rest
      } = userData;

      // Check if user already exists
      const existingUser = await UserService.findUserByEmail(email);
      if (existingUser) {
        throw new AppError("Email already in use", 400);
      }

      // Check if username is taken
      const existingUsername = await UserService.findUserByUsername(username);
      if (existingUsername) {
        throw new AppError("Username already taken", 400);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await UserService.createUser({
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        username,
        role,
        is_verified: false,
        is_active: true,
        ...rest,
      });

      let profile: Profile | undefined;

      if (profileData) {
        profile = await UserService.upsertProfile({
          user_id: newUser.id,
          ...profileData,
        });
      }

      return {
        user: newUser,
        profile,
      };
    } catch (error) {
      logger.error("Error in createUserWithProfile:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create user with profile", 500);
    }
  }

  /**
   * Update password reset token for a user
   * @param userId User ID
   * @param token Hashed reset token
   * @param expiresAt Token expiration date
   * @returns Updated user
   */
  static async updatePasswordResetToken(
    userId: string,
    token: string | null,
    expiresAt: Date | null
  ): Promise<User> {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({
          reset_password_token: token,
          reset_password_expires: expiresAt ? expiresAt.toISOString() : null,
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating password reset token:", error);
        throw new AppError("Failed to update password reset token", 500);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updatePasswordResetToken:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update password reset token", 500);
    }
  }

  /**
   * Find user by reset token
   * @param token Hashed reset token
   * @returns User or null
   */
  static async findUserByResetToken(token: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("reset_password_token", token)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          return null;
        }
        logger.error("Error finding user by reset token:", error);
        throw new AppError("Failed to find user by reset token", 500);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in findUserByResetToken:", error);
      if (error instanceof AppError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Update user password
   * @param userId User ID
   * @param hashedPassword New hashed password
   * @returns Updated user
   */
  static async updatePassword(
    userId: string,
    hashedPassword: string
  ): Promise<User> {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({
          password_hash: hashedPassword,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating password:", error);
        throw new AppError("Failed to update password", 500);
      }

      return data as User;
    } catch (error) {
      logger.error("Error in updatePassword:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update password", 500);
    }
  }

  /**
   * Search users (public search for authenticated users)
   * Returns only public user information with Redis caching
   * @param options Search options
   * @returns Users and total count
   */
  static async searchUsers(options: {
    search: string;
    page?: number;
    limit?: number;
    sort_by?: string;
    order?: "asc" | "desc";
  }): Promise<{ users: User[]; total: number }> {
    try {
      const {
        search,
        page = 1,
        limit = 10,
        sort_by = "username",
        order = "asc",
      } = options;

      // Validate search term
      if (!search || search.trim().length < 2) {
        return { users: [], total: 0 };
      }

      const searchTerm = search.trim().toLowerCase();

      // Create cache key based on search parameters
      const cacheKey = redisService.keys.userSearch(
        searchTerm,
        page,
        limit,
        sort_by,
        order
      );

      // Try to get from cache first
      const cached = await redisService.get<{ users: User[]; total: number }>(
        cacheKey
      );

      if (cached) {
        logger.debug(`User search cache hit: ${searchTerm}`);
        return cached;
      }

      logger.debug(`User search cache miss: ${searchTerm}`);

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Build query - select only public fields for security
      let query = supabase
        .from("users")
        .select(
          "id, username, first_name, last_name, profile_picture, bio, is_verified, created_at",
          { count: "exact" }
        );

      // Only search active users
      query = query.eq("is_active", true);

      // Apply search filter across multiple fields
      query = query.or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`
      );

      // Apply sorting
      const validSortFields = [
        "username",
        "first_name",
        "last_name",
        "created_at",
      ];
      const sortField = validSortFields.includes(sort_by)
        ? sort_by
        : "username";
      query = query.order(sortField, { ascending: order === "asc" });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      // Execute the query
      const { data, error, count } = await query;

      if (error) {
        logger.error("Error searching users:", error);
        throw new AppError(error.message, 400);
      }

      const result = {
        users: (data as User[]) || [],
        total: count || 0,
      };

      // Cache the results for 5 minutes
      await redisService.set(
        cacheKey,
        result,
        redisService.getTTL().USER_SEARCH
      );

      return result;
    } catch (error) {
      logger.error("Error in searchUsers:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to search users", 500);
    }
  }

  /**
   * Invalidate user search cache
   * Call this when a user updates their profile
   */
  static async invalidateUserSearchCache(): Promise<void> {
    try {
      // Delete all user search cache keys
      const pattern = "user:search:*";
      await redisService.deletePattern(pattern);
      logger.debug("User search cache invalidated");
    } catch (error) {
      logger.error("Error invalidating user search cache:", error);
    }
  }
}
