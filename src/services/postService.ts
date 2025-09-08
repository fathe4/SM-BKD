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
import { StorageService } from "./storageService";
import { logger } from "../utils/logger";
import { PostBoost, PostBoostCreate, BoostStatus } from "../models/boost.model";
import { redisService, CachedFeedResult } from "./redis.service";

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

      // Invalidate relevant feed caches
      await this.invalidateRelevantFeeds(postData.user_id, postData.location);

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
        .select(
          "*, post_media(*), users!inner(id, username, first_name, last_name, profile_picture)"
        )
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
        .select(
          "*, post_media(*), users!inner(id, username, first_name, last_name, profile_picture)",
          { count: "exact" }
        )
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

  // ============= FEED HELPER METHODS =============

  /**
   * Calculate total available posts for pagination
   * Private helper method to get accurate total counts
   */
  private static calculateTotalAvailablePosts = asyncHandler(
    async (
      userId: string,
      friendIds: string[],
      userLocation: any,
      seenBoosts: string[]
    ): Promise<{
      totalFriendsPosts: number;
      totalBoostedPosts: number;
      totalFriendLikedPosts: number;
      totalPublicPosts: number;
      estimatedTotal: number;
    }> => {
      // Calculate totals in parallel
      const [friendsCount, boostedCount, friendLikedCount, publicCount] =
        await Promise.all([
          // Count friend posts
          friendIds.length > 0
            ? supabase
                .from("posts")
                .select("id", { count: "exact" })
                .in("user_id", friendIds)
                .eq("is_deleted", false)
                .eq("visibility", PostVisibility.PUBLIC)
                .then(({ count }) => count || 0)
            : Promise.resolve(0),

          // Count boosted posts
          userLocation?.country
            ? supabase
                .from("posts")
                .select("id", { count: "exact" })
                .eq("post_boosts.status", BoostStatus.ACTIVE)
                .eq("post_boosts.country", userLocation.country)
                .eq("is_deleted", false)
                .gte("post_boosts.expires_at", new Date().toISOString())
                .not(
                  "id",
                  "in",
                  `(${seenBoosts.length > 0 ? seenBoosts.join(",") : "null"})`
                )
                .then(({ count }) => count || 0)
            : Promise.resolve(0),

          // Count friend-liked posts
          friendIds.length > 0
            ? supabase
                .from("reactions")
                .select("target_id", { count: "exact" })
                .in("user_id", friendIds)
                .eq("target_type", "post")
                .eq("reaction_type", "like")
                .then(({ count }) => count || 0)
            : Promise.resolve(0),

          // Count public posts (excluding user and friends)
          supabase
            .from("posts")
            .select("id", { count: "exact" })
            .eq("is_deleted", false)
            .eq("visibility", PostVisibility.PUBLIC)
            .not("user_id", "in", `(${[userId, ...friendIds].join(",")})`)
            .then(({ count }) => count || 0),
        ]);

      // Estimate total based on mixing ratios
      // Friend posts get priority, then we add estimated mixed content
      const estimatedTotal = Math.max(
        friendsCount +
          Math.min(boostedCount, 20) +
          Math.min(friendLikedCount, 10) +
          publicCount,
        friendsCount || publicCount || 0
      );

      return {
        totalFriendsPosts: friendsCount,
        totalBoostedPosts: boostedCount,
        totalFriendLikedPosts: friendLikedCount,
        totalPublicPosts: publicCount,
        estimatedTotal,
      };
    },
    "Failed to calculate total posts"
  );

  /**
   * Get paginated posts with proper offset handling
   * Private helper method for paginated feed generation
   */
  private static getPaginatedFeedData = asyncHandler(
    async (
      userId: string,
      friendIds: string[],
      userLocation: any,
      seenBoosts: string[],
      page: number,
      limit: number
    ) => {
      // Calculate how many posts we need to fetch to support pagination
      const bufferMultiplier = Math.max(page * 2, 3); // Fetch more data for later pages

      // Fetch larger datasets to support pagination
      const [friendsPosts, boostedPosts, friendLikedPosts, publicPosts] =
        await Promise.all([
          this.getFriendsPostsCached(friendIds, limit * bufferMultiplier),
          this.getBoostedPostsCached(
            userLocation,
            Math.min(page * 3, 10),
            seenBoosts
          ), // Scale boosts with page
          this.getFriendLikedPostsCached(friendIds, Math.min(page * 5, 15), [
            userId,
            ...friendIds,
          ]), // Scale friend-liked
          this.getPublicPostsCached(limit * bufferMultiplier, [
            userId,
            ...friendIds,
          ]), // Get plenty of public posts
        ]);

      return {
        friendsPosts,
        boostedPosts,
        friendLikedPosts,
        publicPosts,
      };
    },
    "Failed to get paginated feed data"
  );

  /**
   * Generate paginated mixed feed
   * Maintains consistent mixing ratios across pages
   */
  // private static generatePaginatedFeed = (
  //   feedData: {
  //     friendsPosts: any[];
  //     boostedPosts: any[];
  //     friendLikedPosts: any[];
  //     publicPosts: any[];
  //   },
  //   page: number,
  //   limit: number
  // ): any[] => {
  //   const { friendsPosts, boostedPosts, friendLikedPosts, publicPosts } =
  //     feedData;

  //   // Create a large mixed feed first
  //   const largeMixedFeed = this.simpleFeedMix({
  //     friendsPosts,
  //     boostedPosts,
  //     friendLikedPosts,
  //     publicPosts,
  //     limit: limit * Math.max(page * 2, 5), // Generate larger feed for pagination
  //   });
  //   console.log(largeMixedFeed, "largeMixedFeed");

  //   // Apply pagination offset
  //   const startIndex = (page - 1) * limit;
  //   const endIndex = startIndex + limit;

  //   // Return paginated results
  //   return largeMixedFeed.slice(startIndex, endIndex);
  // };

  /**
   * Get user location with caching
   * Private helper method for feed generation
   */
  private static getUserLocationCached = asyncHandler(
    async (userId: string) => {
      // Try cache first
      let location = await redisService.getUserLocation(userId);

      if (!location) {
        // Fetch from database
        const { data, error } = await supabase
          .from("user_locations")
          .select("city, country, coordinates")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          logger.warn(`Failed to fetch user location for ${userId}:`, error);
        }

        location = data || { city: null, country: null };

        // Cache the result
        await redisService.setUserLocation(userId, location);
      }

      return location;
    },
    "Failed to get user location"
  );

  /**
   * Get user friends list with caching
   * Private helper method for feed generation
   */
  private static getUserFriendsCached = asyncHandler(
    async (userId: string): Promise<string[]> => {
      // Try cache first
      let friendIds = await redisService.getUserFriends(userId);

      if (!friendIds) {
        // Fetch from database
        const { data, error } = await supabase
          .from("friendships")
          .select("requester_id, addressee_id")
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .eq("status", FriendshipStatus.ACCEPTED);

        if (error) {
          logger.warn(`Failed to fetch user friends for ${userId}:`, error);
          return [];
        }

        // Extract friend IDs
        friendIds = (data || []).map(f =>
          f.requester_id === userId ? f.addressee_id : f.requester_id
        );

        // Cache the result
        await redisService.setUserFriends(userId, friendIds);
      }

      return friendIds;
    },
    "Failed to get user friends"
  );

  /**
   * Simple feed mixing - fill feed to requested limit
   * Private helper method for feed generation
   */
  private static simpleFeedMix = (options: {
    friendsPosts: any[];
    boostedPosts: any[];
    friendLikedPosts: any[];
    publicPosts: any[];
    limit: number;
  }): any[] => {
    const { friendsPosts, boostedPosts, friendLikedPosts, publicPosts, limit } =
      options;
    const result: any[] = [];

    // Add friend posts first
    friendsPosts.forEach(post => {
      if (result.length < limit) {
        result.push({ ...post, feed_type: "friends" });
      }
    });

    // Add boosted posts (intersperse every 3-4 posts)
    const availableBoosted = [...boostedPosts];
    let boostIndex = 3; // Start adding boosts at position 3

    while (availableBoosted.length > 0 && result.length < limit) {
      if (result.length >= boostIndex) {
        const boostedPost = availableBoosted.shift();
        if (boostedPost) {
          result.splice(boostIndex, 0, {
            ...boostedPost,
            feed_type: "boosted",
          });
          boostIndex += 4; // Next boost position
        }
      } else {
        break;
      }
    }

    // Add friend-liked posts (every 5th position after friends posts)
    // Filter out posts already in feed to avoid duplicates for friend-liked
    const usedPostIds = result.map(post => post.id);
    const availableFriendLiked = friendLikedPosts.filter(
      post => !usedPostIds.includes(post.id)
    );

    let friendLikedIndex = 4; // Start at position 4
    availableFriendLiked.forEach(post => {
      if (result.length >= friendLikedIndex && result.length < limit) {
        result.splice(friendLikedIndex, 0, {
          ...post,
          feed_type: "friend_liked",
        });
        friendLikedIndex += 5; // Next friend-liked post position
      }
    });

    // Fill remaining slots with public posts
    // Remove boosted posts from public posts to avoid confusion
    const boostedPostIds = boostedPosts.map(post => post.id);
    const availablePublic = publicPosts.filter(
      post => !boostedPostIds.includes(post.id)
    );

    availablePublic.forEach(post => {
      if (result.length < limit) {
        result.push({ ...post, feed_type: "public" });
      }
    });

    // If still not enough, add remaining boosted posts
    availableBoosted.forEach(post => {
      if (result.length < limit) {
        result.push({ ...post, feed_type: "boosted" });
      }
    });

    return result.slice(0, limit);
  };

  /**
   * Get boosted posts with location targeting and deduplication
   * Private helper method for feed generation
   */
  private static getBoostedPostsCached = asyncHandler(
    async (
      userLocation: { city: string | null; country: string | null },
      targetCount: number,
      seenBoosts: string[]
    ) => {
      const { country } = userLocation;
      const boostedPosts: any[] = [];

      // Get location-targeted boosts only (if user has location)
      if (country) {
        let locationBoosts = await redisService.getBoostedPosts(country);

        if (!locationBoosts) {
          const { data, error } = await supabase
            .from("posts")
            .select(
              `
              *, 
              post_media(*), 
              users!inner(username, first_name, last_name, profile_picture),
              post_boosts!inner(status, city, country, expires_at)
            `
            )
            .eq("post_boosts.status", BoostStatus.ACTIVE)
            .eq("post_boosts.country", country)
            .eq("is_deleted", false)
            .gte("post_boosts.expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(20); // Reasonable limit for location boosts

          if (error) {
            logger.warn("Failed to fetch location boosted posts:", error);
            locationBoosts = [];
          } else {
            locationBoosts = data || [];
            await redisService.setBoostedPosts(country, locationBoosts);
          }
        }

        boostedPosts.push(...(locationBoosts || []));
      }

      // Remove duplicates and filter out seen posts
      const uniqueBoosts = boostedPosts
        .filter(
          (post, index, self) =>
            // Remove duplicates by ID
            self.findIndex(p => p.id === post.id) === index &&
            // // Remove posts user has already seen
            !seenBoosts.includes(post.id)
        )
        .slice(0, Math.ceil(targetCount * 1.5)); // Get extra for rotation
      console.log(uniqueBoosts, "uniqueBoosts");
      console.log(seenBoosts, "uniqueBoosts");

      return uniqueBoosts;
    },
    "Failed to get boosted posts"
  );

  /**
   * Get friends posts with caching
   * Private helper method for feed generation
   */
  private static getFriendsPostsCached = asyncHandler(
    async (friendIds: string[], targetCount: number) => {
      if (friendIds.length === 0) return [];

      // For simplicity, we'll fetch fresh friends posts for now
      // In production, you might want to cache this per friend combination
      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          *, 
          post_media(*), 
          users!inner(username, first_name, last_name, profile_picture)
        `
        )
        .in("user_id", friendIds)
        .eq("is_deleted", false)
        .in("visibility", [PostVisibility.PUBLIC, PostVisibility.FRIENDS])
        .order("created_at", { ascending: false })
        .limit(Math.ceil(targetCount * 1.5)); // Get extra for mixing

      if (error) {
        logger.warn("Failed to fetch friends posts:", error);
        return [];
      }

      return data || [];
    },
    "Failed to get friends posts"
  );

  /**
   * Get location-based posts with caching
   * Private helper method for feed generation
   */
  //   private static getLocationPostsCached = asyncHandler(
  //     async (
  //       userLocation: { city: string | null; country: string | null },
  //       targetCount: number,
  //       page: number = 1
  //     ) => {
  //       const { city, country } = userLocation;

  //       if (!city || !country) return [];

  //       // Try cache first
  //       let locationPosts = await redisService.getLocationPosts(
  //         city,
  //         country,
  //         page
  //       );

  //       if (!locationPosts) {
  //         // Note: This assumes posts will eventually have location data
  //         // For now, we'll return empty array since organic posts don't have location
  //         // In the future, you might want to implement location-based organic posts
  //         locationPosts = [];

  //         // Cache the empty result to avoid repeated queries
  //         await redisService.setLocationPosts(city, country, page, locationPosts);
  //       }

  //       return locationPosts;
  //     },
  //     "Failed to get location posts"
  //   );

  /**
   * Get posts that user's friends have liked
   * Shows posts user might be interested in based on friend activity
   */
  private static getFriendLikedPostsCached = asyncHandler(
    async (
      friendIds: string[],
      targetCount: number,
      excludeUserIds: string[] = []
    ) => {
      if (friendIds.length === 0) return [];

      // Try cache first (simple approach for now)
      const cacheKey = `friend_liked_posts:${friendIds.sort().join(",")}`;
      let friendLikedPosts: any[] = (await redisService.get(cacheKey)) || [];

      if (friendLikedPosts.length === 0) {
        // Get posts that friends have liked (recent reactions first)
        const { data: reactionData, error } = await supabase
          .from("reactions")
          .select("target_id, created_at")
          .in("user_id", friendIds) // Reactions from user's friends
          .eq("target_type", "post") // Only post reactions
          .eq("reaction_type", "like") // Only likes
          .order("created_at", { ascending: false }) // Recent likes first
          .limit(targetCount * 3); // Get extra for filtering

        console.log(reactionData, "reactionData");

        if (error) {
          logger.warn("Failed to fetch friend reactions:", error);
          return [];
        }

        if (!reactionData || reactionData.length === 0) {
          return [];
        }

        // Get unique post IDs
        const likedPostIds = [...new Set(reactionData.map(r => r.target_id))];

        // Now fetch the actual posts
        let postsQuery = supabase
          .from("posts")
          .select(
            `
            *,
            post_media(*),
            users!inner(username, first_name, last_name, profile_picture)
          `
          )
          .in("id", likedPostIds)
          .eq("is_deleted", false)
          .eq("visibility", PostVisibility.PUBLIC)
          .limit(targetCount * 2);

        // Exclude specific users if provided
        if (excludeUserIds.length > 0) {
          postsQuery = postsQuery.not(
            "user_id",
            "in",
            `(${excludeUserIds.join(",")})`
          );
        }

        const { data: postsData, error: postsError } = await postsQuery;
        console.log(postsData, "postsData react frined");

        if (postsError) {
          logger.warn("Failed to fetch friend-liked posts:", postsError);
          return [];
        }

        // Sort posts by reaction time (most recently liked first)
        const sortedPosts = (postsData || []).sort((a, b) => {
          const reactionA = reactionData.find(r => r.target_id === a.id);
          const reactionB = reactionData.find(r => r.target_id === b.id);
          return (
            new Date(reactionB?.created_at || 0).getTime() -
            new Date(reactionA?.created_at || 0).getTime()
          );
        });

        friendLikedPosts = sortedPosts;

        console.log(friendLikedPosts, "friendLikedPosts");

        // Cache for 5 minutes (shorter TTL since likes change frequently)
        await redisService.set(cacheKey, friendLikedPosts, 300);
      }

      return friendLikedPosts;
    },
    "Failed to get friend-liked posts"
  );

  /**
   * Get public posts to fill feed with caching
   * Focuses on recent public posts from any users
   */
  private static getPublicPostsCached = asyncHandler(
    async (targetCount: number, excludeUserIds: string[] = []) => {
      // Try cache first (using page 1 for simplicity)
      let publicPosts = await redisService.getPopularPosts(1);

      if (!publicPosts) {
        let query = supabase
          .from("posts")
          .select(
            `
            *, 
            post_media(*), 
            users!inner(username, first_name, last_name, profile_picture)
          `
          )
          .eq("is_deleted", false)
          .eq("visibility", PostVisibility.PUBLIC)
          .order("created_at", { ascending: false }) // Recent posts first
          .limit(Math.max(targetCount * 2, 50)); // Get plenty for mixing

        // Exclude specific users if provided (avoid duplicates)
        if (excludeUserIds.length > 0) {
          query = query.not("user_id", "in", `(${excludeUserIds.join(",")})`);
        }

        const { data, error } = await query;

        if (error) {
          logger.warn("Failed to fetch public posts:", error);
          return [];
        }

        publicPosts = data || [];
        await redisService.setPopularPosts(1, publicPosts);
      }

      return publicPosts;
    },
    "Failed to get public posts"
  );

  // ============= POST MIXING ALGORITHM =============

  /**
   * Intelligent post mixing algorithm
   * Distributes different post types according to calculated ratios
   */
  //   private static intelligentMixPosts = (options: {
  //     friendsPosts: any[];
  //     locationPosts: any[];
  //     boostedPosts: any[];
  //     popularPosts: any[];
  //     composition: any;
  //     limit: number;
  //     userId: string;
  //   }): any[] => {
  //     const {
  //       friendsPosts,
  //       locationPosts,
  //       boostedPosts,
  //       popularPosts,
  //       composition,
  //       limit,
  //     } = options;

  //     const result: any[] = [];

  //     // Create post pools with type information
  //     const postPools = {
  //       friends: friendsPosts.map((post) => ({ ...post, feed_type: "friends" })),
  //       location: locationPosts.map((post) => ({
  //         ...post,
  //         feed_type: "location",
  //       })),
  //       boosted: boostedPosts.map((post) => ({ ...post, feed_type: "boosted" })),
  //       popular: popularPosts.map((post) => ({ ...post, feed_type: "popular" })),
  //     };

  //     // Create weighted distribution slots
  //     const slots = this.createWeightedSlots(limit, composition);

  //     // Fill slots with posts
  //     for (const slot of slots) {
  //       const pool = postPools[slot.type as keyof typeof postPools];

  //       if (pool && pool.length > 0) {
  //         // Take the first post from the pool
  //         const post = pool.shift();
  //         if (post) {
  //           result.push(post);
  //         }
  //       } else {
  //         // Fallback to other types if current type is empty
  //         const fallbackPost = this.getFallbackPost(postPools);
  //         if (fallbackPost) {
  //           result.push({ ...fallbackPost, feed_type: "fallback" });
  //         }
  //       }
  //     }

  //     return result;
  //   };

  /**
   * Create weighted distribution slots based on composition ratios
   * Private helper for post mixing
   */
  //   private static createWeightedSlots = (
  //     limit: number,
  //     composition: any
  //   ): Array<{ type: string; priority: number }> => {
  //     const { friends, location, boosted } = composition;

  //     // Calculate actual counts based on ratios
  //     const friendsCount = Math.round((friends / composition.totalSlots) * limit);
  //     const locationCount = Math.round(
  //       (location / composition.totalSlots) * limit
  //     );
  //     const boostedCount = Math.round((boosted / composition.totalSlots) * limit);
  //     const popularCount = limit - friendsCount - locationCount - boostedCount;

  //     // Create base distribution
  //     const distribution = [
  //       ...Array(friendsCount).fill({ type: "friends", priority: 3 }),
  //       ...Array(locationCount).fill({ type: "location", priority: 2 }),
  //       ...Array(boostedCount).fill({ type: "boosted", priority: 1 }),
  //       ...Array(Math.max(0, popularCount)).fill({
  //         type: "popular",
  //         priority: 1,
  //       }),
  //     ];

  //     // Shuffle for natural distribution (avoid clustering)
  //     const shuffled = this.shuffleArray(distribution);

  //     // Ensure boosted posts are well-distributed (every 3-4 posts)
  //     return this.optimizeBoostedDistribution(shuffled, boostedCount);
  //   };

  /**
   * Shuffle array for natural post distribution
   * Private helper for post mixing
   */
  // private static shuffleArray = <T>(array: T[]): T[] => {
  //   const shuffled = [...array];
  //   for (let i = shuffled.length - 1; i > 0; i--) {
  //     const j = Math.floor(Math.random() * (i + 1));
  //     [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  //   }
  //   return shuffled;
  // };

  /**
   * Optimize boosted post distribution to avoid clustering
   * Private helper for post mixing
   */
  //   private static optimizeBoostedDistribution = (
  //     slots: Array<{ type: string; priority: number }>,
  //     boostedCount: number
  //   ): Array<{ type: string; priority: number }> => {
  //     if (boostedCount === 0) return slots;

  //     const optimized = [...slots];
  //     const interval = Math.floor(slots.length / boostedCount);

  //     // Move boosted posts to evenly distributed positions
  //     const boostedSlots = optimized.filter((slot) => slot.type === "boosted");
  //     const nonBoostedSlots = optimized.filter((slot) => slot.type !== "boosted");

  //     const result: Array<{ type: string; priority: number }> = [];
  //     let boostedIndex = 0;
  //     let nonBoostedIndex = 0;

  //     for (let i = 0; i < slots.length; i++) {
  //       // Place boosted post every 'interval' positions
  //       if (i > 0 && i % interval === 0 && boostedIndex < boostedSlots.length) {
  //         result.push(boostedSlots[boostedIndex++]);
  //       } else if (nonBoostedIndex < nonBoostedSlots.length) {
  //         result.push(nonBoostedSlots[nonBoostedIndex++]);
  //       }
  //     }

  //     // Add any remaining posts
  //     while (boostedIndex < boostedSlots.length) {
  //       result.push(boostedSlots[boostedIndex++]);
  //     }
  //     while (nonBoostedIndex < nonBoostedSlots.length) {
  //       result.push(nonBoostedSlots[nonBoostedIndex++]);
  //     }

  //     return result.slice(0, slots.length);
  //   };

  /**
   * Get fallback post when preferred type is unavailable
   * Private helper for post mixing
   */
  //   private static getFallbackPost = (postPools: any): any => {
  //     // Priority order for fallback: friends > popular > location > boosted
  //     const fallbackOrder = ["friends", "popular", "location", "boosted"];

  //     for (const type of fallbackOrder) {
  //       const pool = postPools[type];
  //       if (pool && pool.length > 0) {
  //         return pool.shift();
  //       }
  //     }

  //     return null;
  //   };

  /**
   * Track seen boosted posts for deduplication
   * Private helper for analytics and deduplication
   */
  private static trackSeenBoosts = async (
    userId: string,
    posts: any[]
  ): Promise<void> => {
    const boostedPosts = posts.filter(post => post.feed_type === "boosted");

    for (const post of boostedPosts) {
      await redisService.addSeenBoost(userId, post.id);
    }
  };

  // ============= MAIN FEED METHOD =============

  /**
   * Get posts for the feed with pagination
   * Includes posts from user and their friends, or popular posts if no friends
   */
  static getFeedPosts = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 10
    ): Promise<{ posts: Post[]; total: number; composition?: any }> => {
      // Validate pagination parameters
      if (page < 1) {
        throw new AppError("Page number must be greater than 0", 400);
      }
      if (limit < 1) {
        throw new AppError("Limit must be greater than 0", 400);
      }
      if (limit > 50) {
        throw new AppError("Limit cannot exceed 50 posts per page", 400);
      }

      // 1. Try cache first (include total in cache structure)
      const cachedFeed = await redisService.getUserFeed(userId, page);
      if (cachedFeed) {
        const feedResult = cachedFeed as CachedFeedResult;
        return {
          posts: feedResult.posts as unknown as Post[],
          total: feedResult.total,
          composition: {
            cached: true,
            page,
            hasMore: page * limit < feedResult.total,
          },
        };
      }

      // 2. Get user location (with caching)
      const userLocation = await this.getUserLocationCached(userId);

      // 3. Get user friends (with caching)
      const friendIds = await this.getUserFriendsCached(userId);

      // 4. Get seen boosts for deduplication
      const seenBoosts = await redisService.getSeenBoosts(userId);

      // 5. Calculate total available posts for proper pagination
      const totalCounts = await this.calculateTotalAvailablePosts(
        userId,
        friendIds,
        userLocation,
        seenBoosts
      );

      // 6. Get paginated feed data with proper scaling
      const feedData = await this.getPaginatedFeedData(
        userId,
        friendIds,
        userLocation,
        seenBoosts,
        page,
        limit
      );

      console.log("Feed data lengths:", {
        friends: feedData.friendsPosts.length,
        boosted: feedData.boostedPosts.length,
        friendLiked: feedData.friendLikedPosts.length,
        public: feedData.publicPosts.length,
      });

      // 7. Generate mixed feed directly (simpler approach)
      const mixedFeed = this.simpleFeedMix({
        friendsPosts: feedData.friendsPosts,
        boostedPosts: feedData.boostedPosts,
        friendLikedPosts: feedData.friendLikedPosts,
        publicPosts: feedData.publicPosts,
        limit,
      });

      console.log(
        "Direct mixed feed:",
        mixedFeed.map(p => ({ id: p.id, feed_type: p.feed_type }))
      );

      // 8. Track seen boosted posts
      await this.trackSeenBoosts(userId, mixedFeed);

      // 9. Cache the result with total count
      const feedResult = {
        posts: mixedFeed,
        total: totalCounts.estimatedTotal,
        page,
        hasMore: page * limit < totalCounts.estimatedTotal,
      };

      await redisService.setUserFeed(userId, page, feedResult);

      return {
        posts: mixedFeed as unknown as Post[],
        total: totalCounts.estimatedTotal,
        composition: {
          cached: false,
          page,
          hasMore: page * limit < totalCounts.estimatedTotal,
          totalPages: Math.ceil(totalCounts.estimatedTotal / limit),
          counts: {
            friends: feedData.friendsPosts.length,
            boosted: feedData.boostedPosts.length,
            friendLiked: feedData.friendLikedPosts.length,
            public: feedData.publicPosts.length,
            mixed: mixedFeed.length,
            requested: limit,
          },
          totals: {
            availableFriends: totalCounts.totalFriendsPosts,
            availableBoosted: totalCounts.totalBoostedPosts,
            availableFriendLiked: totalCounts.totalFriendLikedPosts,
            availablePublic: totalCounts.totalPublicPosts,
            estimatedTotal: totalCounts.estimatedTotal,
          },
        },
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
        .select(
          "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
          {
            count: "exact",
          }
        );

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

  /**
   * Delete all media for a post
   */
  static deletePostMedia = asyncHandler(
    async (postId: string): Promise<void> => {
      // First get the current media items to delete them from storage later
      const { data: mediaItems, error: fetchError } = await supabase
        .from("post_media")
        .select("media_url")
        .eq("post_id", postId);

      if (fetchError) {
        throw new AppError(fetchError.message, 400);
      }

      // Delete the media records from the database
      const { error: deleteError } = await supabaseAdmin!
        .from("post_media")
        .delete()
        .eq("post_id", postId);

      if (deleteError) {
        throw new AppError(deleteError.message, 400);
      }

      // Attempt to delete the files from storage
      // This is best-effort - we don't want to fail if the file is already gone
      for (const item of mediaItems) {
        try {
          // Extract the file path from the URL
          const urlParts = item.media_url.split("/public/");
          if (urlParts.length > 1) {
            const bucketAndPath = urlParts[1].split("/");
            if (bucketAndPath.length > 1) {
              bucketAndPath.shift(); // Remove bucket name
              const filePath = bucketAndPath.join("/");

              // Delete the file from storage
              await StorageService.deleteFile("post-media", filePath);
            }
          }
        } catch (error) {
          // Log but don't throw - we want to continue even if one file fails
          logger.warn(`Failed to delete media file: ${item.media_url}`, error);
        }
      }
    },
    "Failed to delete post media"
  );

  /**
   * Get posts for the authenticated user with pagination
   */
  static getMyPosts = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 10
    ): Promise<{ posts: Post[]; total: number }> => {
      // We can leverage the existing getUserPosts method since the logic is the same
      // The only difference is we're using the authenticated user's ID
      // and we don't need visibility checks since users can always see their own posts
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("posts")
        .select(
          "*, post_media(*), users!inner(username, first_name, last_name, profile_picture)",
          {
            count: "exact",
          }
        )
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        posts: data as unknown as Post[],
        total: count || 0,
      };
    },
    "Failed to get my posts"
  );

  /**
   * Create a new post boost (status: pending_payment)
   */
  static createPostBoost = asyncHandler(
    async (
      userId: string,
      postId: string,
      boostData: Omit<PostBoostCreate, "user_id" | "post_id" | "amount">
    ): Promise<PostBoost> => {
      // Check for existing active or pending boost for this post
      const { data: existing, error: existingError } = await supabase
        .from("post_boosts")
        .select("id, status")
        .eq("post_id", postId)
        .in("status", [
          BoostStatus.ACTIVE,
          BoostStatus.PAUSE,
          BoostStatus.PENDING_PAYMENT,
        ])
        .maybeSingle();
      if (existing && !existingError) {
        throw new AppError(
          "A boost is already active or pending for this post.",
          400
        );
      }

      // Fetch the correct pricing tier for the requested days
      const { data: pricing, error: pricingError } = await supabase
        .from("boost_pricing")
        .select("*")
        .lte("min_days", boostData.days)
        .or(`max_days.gte.${boostData.days},max_days.is.null`)
        .eq("is_active", true)
        .order("min_days", { ascending: false })
        .limit(1)
        .single();

      if (pricingError || !pricing) {
        throw new AppError(
          "No valid boost pricing tier found for the requested duration.",
          400
        );
      }

      // Calculate the amount
      const rawPrice = pricing.base_price_per_day * boostData.days;
      const discount = pricing.discount_percent || 0;
      const amount = +(rawPrice * (1 - discount / 100)).toFixed(2);

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + boostData.days * 24 * 60 * 60 * 1000
      );
      console.log(boostData, "boostData");

      const { data, error } = await supabaseAdmin!
        .from("post_boosts")
        .insert({
          ...boostData,
          user_id: userId,
          post_id: postId,
          amount,
          status: BoostStatus.PENDING_PAYMENT,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw new AppError(error.message, 400);
      return data as PostBoost;
    },
    "Failed to create post boost"
  );

  /**
   * List all boosts for a user (optionally filter by status)
   */
  static getUserBoosts = asyncHandler(
    async (userId: string, status?: BoostStatus): Promise<PostBoost[]> => {
      let query = supabase
        .from("post_boosts")
        .select("*")
        .eq("user_id", userId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw new AppError(error.message, 400);
      return data as PostBoost[];
    },
    "Failed to get user boosts"
  );

  /**
   * Get boost status for a post
   */
  static getPostBoostStatus = asyncHandler(
    async (postId: string): Promise<PostBoost | null> => {
      const { data, error } = await supabase
        .from("post_boosts")
        .select("*")
        .eq("post_id", postId)
        .in("status", [
          BoostStatus.ACTIVE,
          BoostStatus.PAUSE,
          BoostStatus.PENDING_PAYMENT,
        ])
        .maybeSingle();
      if (error) throw new AppError(error.message, 400);
      return (data as PostBoost) || null;
    },
    "Failed to get post boost status"
  );

  /**
   * Update the status of a boost (handles all status changes)
   */
  static updateBoostStatus = asyncHandler(
    async (boostId: string, status: BoostStatus): Promise<void> => {
      // For statuses other than ACTIVE
      if (status === BoostStatus.ACTIVE) {
        throw new AppError("Use activateBoost for activation logic.", 400);
      }
      const { error } = await supabaseAdmin!
        .from("post_boosts")
        .update({ status })
        .eq("id", boostId);

      console.log(error, "error update boost");

      if (error) throw new AppError(error.message, 400);
    },
    "Failed to update boost status"
  );

  static activateBoost = asyncHandler(
    async (boostId: string): Promise<void> => {
      // Fetch the boost to get post_id and days if needed
      const { data: boost, error: fetchError } = await supabase
        .from("post_boosts")
        .select("id, post_id, days, city, country")
        .eq("id", boostId)
        .single();
      if (fetchError || !boost) throw new AppError("Boost not found", 404);

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + boost.days * 24 * 60 * 60 * 1000
      );
      // Expire all other boosts for this post
      await supabaseAdmin!
        .from("post_boosts")
        .update({ status: BoostStatus.EXPIRED })
        .eq("post_id", boost.post_id)
        .neq("id", boostId)
        .in("status", [BoostStatus.ACTIVE, BoostStatus.PAUSE]);
      // Activate this boost
      const { error } = await supabaseAdmin!
        .from("post_boosts")
        .update({
          status: BoostStatus.ACTIVE,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", boostId);
      if (error) throw new AppError(error.message, 400);

      // Invalidate boosted post caches immediately for real-time updates
      if (boost.city && boost.country) {
        await redisService.invalidateLocationFeeds(boost.city, boost.country);
        // Clear specific location boost cache
        await redisService.delete(
          redisService.keys.boostedPosts(boost.country)
        );
      }
      // Clear all boosted post caches
      await redisService.invalidateBoostedPosts();

      // Invalidate all user feeds for immediate boost visibility
      await redisService.deletePattern("feed:user:*");
    },
    "Failed to activate boost"
  );

  // ============= CACHE INVALIDATION HELPERS =============

  /**
   * Invalidate friend-liked posts cache when a like is created/removed
   * Call this method when posts are liked/unliked
   */
  static invalidateFriendLikedCache = async (userId: string): Promise<void> => {
    try {
      // Get user's friends to invalidate their caches
      const friendIds = await this.getUserFriendsCached(userId);

      // Invalidate friend-liked posts cache for each friend
      for (const friendId of friendIds) {
        // Get friend's friends to build cache key
        const friendOfFriendIds = await this.getUserFriendsCached(friendId);
        const cacheKey = `friend_liked_posts:${friendOfFriendIds
          .sort()
          .join(",")}`;
        await redisService.delete(cacheKey);

        // Also invalidate friend's feed cache
        await redisService.invalidateUserFeed(friendId);
      }

      logger.info(
        `Invalidated friend-liked caches for user ${userId} affecting ${friendIds.length} friends`
      );
    } catch (error) {
      logger.warn("Failed to invalidate friend-liked caches:", error);
    }
  };

  /**
   * Invalidate relevant feed caches when posts are created/updated
   * Private helper method for cache consistency
   */
  private static invalidateRelevantFeeds = async (
    userId: string,
    location?: any
  ): Promise<void> => {
    try {
      // Invalidate user's own feed
      await redisService.invalidateUserFeed(userId);

      // Invalidate friends' feeds (they might see this post)
      const friendIds = await this.getUserFriendsCached(userId);
      await Promise.all(
        friendIds.map(friendId => redisService.invalidateUserFeed(friendId))
      );

      // Invalidate location-based feeds if post has location
      if (location?.city && location?.country) {
        await redisService.invalidateLocationFeeds(
          location.city,
          location.country
        );
      }

      // Invalidate popular posts cache (new post might affect popularity)
      await redisService.invalidatePopularPosts();

      logger.info(
        `Invalidated feed caches for user ${userId} and ${friendIds.length} friends`
      );
    } catch (error) {
      // Log but don't throw - cache invalidation shouldn't break the main operation
      logger.warn("Failed to invalidate feed caches:", error);
    }
  };
}
