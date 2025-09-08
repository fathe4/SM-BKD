// tests/feed.test.ts
import { describe, it, beforeEach, afterEach, beforeAll, afterAll, expect, jest } from "@jest/globals";
import { PostService } from "../src/services/postService";
import { redisService } from "../src/services/redis.service";
import { supabase, supabaseAdmin } from "../src/config/supabase";
import { PostVisibility, Post } from "../src/models/post.model";
import { BoostStatus } from "../src/models/boost.model";
import { FriendshipStatus } from "../src/models/friendship.model";

// Mock dependencies
jest.mock("../src/config/supabase");
jest.mock("../src/services/redis.service");
jest.mock("../src/utils/logger");

describe("Feed Posts System", () => {
  // Test data factory
  class FeedTestDataFactory {
    static createUser(id: string, overrides: any = {}) {
      return {
        id,
        username: `user_${id}`,
        first_name: `First${id}`,
        last_name: `Last${id}`,
        profile_picture: null,
        ...overrides
      };
    }

    static createPost(id: string, userId: string, overrides: any = {}) {
      return {
        id,
        user_id: userId,
        content: `Test post content ${id}`,
        visibility: PostVisibility.PUBLIC,
        is_deleted: false,
        created_at: new Date().toISOString(),
        view_count: 0,
        users: this.createUser(userId),
        post_media: [],
        feed_type: "organic",
        ...overrides
      };
    }

    static createBoostedPost(id: string, userId: string, country: string, overrides: any = {}) {
      return {
        ...this.createPost(id, userId, overrides),
        feed_type: "boosted",
        post_boosts: [{
          id: `boost_${id}`,
          post_id: id,
          user_id: userId,
          status: BoostStatus.ACTIVE,
          country,
          city: "TestCity",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString()
        }]
      };
    }

    static createFriendship(userId1: string, userId2: string) {
      return {
        id: `friendship_${userId1}_${userId2}`,
        user_id: userId1,
        friend_id: userId2,
        status: FriendshipStatus.ACCEPTED,
        created_at: new Date().toISOString()
      };
    }

    static createUserLocation(userId: string, country: string, city: string = "TestCity") {
      return {
        id: `location_${userId}`,
        user_id: userId,
        country,
        city,
        coordinates: { lat: 23.8103, lng: 90.4125 },
        is_active: true,
        created_at: new Date().toISOString()
      };
    }

    static createReaction(userId: string, postId: string, reactionType: string = "like") {
      return {
        id: `reaction_${userId}_${postId}`,
        user_id: userId,
        target_id: postId,
        target_type: "post",
        reaction_type: reactionType,
        created_at: new Date().toISOString()
      };
    }
  }

  // Mock setup
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;
  const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;
  const mockRedisService = redisService as jest.Mocked<typeof redisService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default Redis mocks
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue("OK");
    mockRedisService.delete.mockResolvedValue(1);
    mockRedisService.invalidateUserFeed.mockResolvedValue(undefined);
    
    // Default Supabase mocks
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
    };

    mockSupabase.from.mockReturnValue(mockQuery as any);
    mockSupabaseAdmin!.from.mockReturnValue(mockQuery as any);
  });

  describe("getFeedPosts - Main Integration Tests", () => {
    it("should return mixed feed for user with friends and location", async () => {
      const userId = "user1";
      const friendId = "user2";
      const testCountry = "Bangladesh";
      
      // Mock user location
      mockSupabase.from("user_locations").select()
        .eq("user_id", userId)
        .eq("is_active", true)
        .single.mockResolvedValue({
          data: FeedTestDataFactory.createUserLocation(userId, testCountry),
          error: null
        });

      // Mock friendships
      mockSupabase.from("friendships").select()
        .eq("status", FriendshipStatus.ACCEPTED)
        .mockResolvedValue({
          data: [FeedTestDataFactory.createFriendship(userId, friendId)],
          error: null
        });

      // Mock friend posts
      mockSupabase.from("posts").select()
        .in("user_id", [friendId])
        .mockResolvedValue({
          data: [
            FeedTestDataFactory.createPost("post1", friendId, { feed_type: "friends" }),
            FeedTestDataFactory.createPost("post2", friendId, { feed_type: "friends" })
          ],
          error: null
        });

      // Mock boosted posts
      mockSupabase.from("posts").select()
        .eq("post_boosts.status", BoostStatus.ACTIVE)
        .eq("post_boosts.country", testCountry)
        .mockResolvedValue({
          data: [
            FeedTestDataFactory.createBoostedPost("boost1", "user3", testCountry)
          ],
          error: null
        });

      // Mock friend-liked posts (reactions)
      mockSupabase.from("reactions").select()
        .in("user_id", [friendId])
        .eq("target_type", "post")
        .eq("reaction_type", "like")
        .mockResolvedValue({
          data: [FeedTestDataFactory.createReaction(friendId, "post3")],
          error: null
        });

      // Mock the posts for friend-liked
      mockSupabase.from("posts").select()
        .in("id", ["post3"])
        .mockResolvedValue({
          data: [FeedTestDataFactory.createPost("post3", "user4", { feed_type: "friend_liked" })],
          error: null
        });

      // Mock public posts
      mockSupabase.from("posts").select()
        .not("user_id", "in", `(${userId},${friendId})`)
        .mockResolvedValue({
          data: [
            FeedTestDataFactory.createPost("post4", "user5", { feed_type: "public" }),
            FeedTestDataFactory.createPost("post5", "user6", { feed_type: "public" })
          ],
          error: null
        });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      expect(result).toBeDefined();
      expect(result.posts).toHaveLength(10);
      expect(result.total).toBe(10);
      expect(result.composition).toBeDefined();
      expect(result.composition.counts.friends).toBe(2);
      expect(result.composition.counts.boosted).toBe(1);
      expect(result.composition.counts.mixed).toBe(10);
    });

    it("should prioritize friend posts in feed mixing", async () => {
      const userId = "user1";
      const friendId = "user2";
      
      // Mock data for user with many friend posts
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({
        data: [FeedTestDataFactory.createFriendship(userId, friendId)],
        error: null
      });

      // Mock 5 friend posts
      const friendPosts = Array.from({ length: 5 }, (_, i) => 
        FeedTestDataFactory.createPost(`friend_post_${i}`, friendId, { feed_type: "friends" })
      );

      mockSupabase.from("posts").select()
        .in("user_id", [friendId])
        .mockResolvedValue({ data: friendPosts, error: null });

      // Mock other post types with minimal data
      mockSupabase.from("posts").select()
        .eq("post_boosts.status", BoostStatus.ACTIVE)
        .mockResolvedValue({ data: [], error: null });

      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      mockSupabase.from("posts").select()
        .not("user_id", "in")
        .mockResolvedValue({
          data: Array.from({ length: 10 }, (_, i) => 
            FeedTestDataFactory.createPost(`public_post_${i}`, `user_${i + 10}`, { feed_type: "public" })
          ),
          error: null
        });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      // First few posts should be friend posts
      expect(result.posts[0].feed_type).toBe("friends");
      expect(result.posts[1].feed_type).toBe("friends");
      expect(result.posts[2].feed_type).toBe("friends");
      
      // Should contain all 5 friend posts
      const friendPostsInFeed = result.posts.filter(p => p.feed_type === "friends");
      expect(friendPostsInFeed).toHaveLength(5);
    });

    it("should handle user with no friends or location", async () => {
      const userId = "user1";
      
      // Mock no location
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      
      // Mock no friends
      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      
      // Mock no boosted posts
      mockSupabase.from("posts").select()
        .eq("post_boosts.status", BoostStatus.ACTIVE)
        .mockResolvedValue({ data: [], error: null });

      // Mock no friend reactions
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      // Mock public posts to fill the feed
      const publicPosts = Array.from({ length: 15 }, (_, i) => 
        FeedTestDataFactory.createPost(`public_post_${i}`, `user_${i + 2}`, { feed_type: "public" })
      );

      mockSupabase.from("posts").select()
        .not("user_id", "in", `(${userId})`)
        .mockResolvedValue({ data: publicPosts, error: null });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      expect(result.posts).toHaveLength(10);
      expect(result.composition.counts.friends).toBe(0);
      expect(result.composition.counts.boosted).toBe(0);
      expect(result.composition.counts.friendLiked).toBe(0);
      expect(result.composition.counts.public).toBe(15);
      
      // All posts should be public posts
      result.posts.forEach(post => {
        expect(post.feed_type).toBe("public");
      });
    });

    it("should intersperse boosted posts correctly", async () => {
      const userId = "user1";
      const friendId = "user2";
      const testCountry = "Bangladesh";
      
      // Setup data with multiple boosted posts
      mockSupabase.from("user_locations").select().mockResolvedValue({
        data: FeedTestDataFactory.createUserLocation(userId, testCountry),
        error: null
      });

      mockSupabase.from("friendships").select().mockResolvedValue({
        data: [FeedTestDataFactory.createFriendship(userId, friendId)],
        error: null
      });

      // Mock friend posts
      mockSupabase.from("posts").select()
        .in("user_id", [friendId])
        .mockResolvedValue({
          data: Array.from({ length: 3 }, (_, i) => 
            FeedTestDataFactory.createPost(`friend_post_${i}`, friendId, { feed_type: "friends" })
          ),
          error: null
        });

      // Mock 3 boosted posts
      mockSupabase.from("posts").select()
        .eq("post_boosts.status", BoostStatus.ACTIVE)
        .mockResolvedValue({
          data: Array.from({ length: 3 }, (_, i) => 
            FeedTestDataFactory.createBoostedPost(`boost_${i}`, `booster_${i}`, testCountry)
          ),
          error: null
        });

      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      mockSupabase.from("posts").select()
        .not("user_id", "in")
        .mockResolvedValue({
          data: Array.from({ length: 10 }, (_, i) => 
            FeedTestDataFactory.createPost(`public_post_${i}`, `user_${i + 10}`, { feed_type: "public" })
          ),
          error: null
        });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      const boostedPostsInFeed = result.posts.filter(p => p.feed_type === "boosted");
      expect(boostedPostsInFeed.length).toBeLessThanOrEqual(3); // Max 3 boosts as per logic
      
      // Check that boosted posts are interspersed (not all at the beginning or end)
      const boostedPositions = result.posts
        .map((post, index) => post.feed_type === "boosted" ? index : -1)
        .filter(pos => pos !== -1);
      
      if (boostedPositions.length > 1) {
        // Positions should not be consecutive
        for (let i = 1; i < boostedPositions.length; i++) {
          expect(boostedPositions[i] - boostedPositions[i - 1]).toBeGreaterThan(1);
        }
      }
    });

    it("should respect seen boosts deduplication", async () => {
      const userId = "user1";
      const testCountry = "Bangladesh";
      const seenBoostId = "seen_boost_1";
      
      // Mock user has seen a boost
      mockRedisService.get.mockImplementation((key: string) => {
        if (key.includes("seen_boosts")) {
          return Promise.resolve([seenBoostId]);
        }
        return Promise.resolve(null);
      });

      mockSupabase.from("user_locations").select().mockResolvedValue({
        data: FeedTestDataFactory.createUserLocation(userId, testCountry),
        error: null
      });

      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });

      // Mock boosted posts including the seen one
      mockSupabase.from("posts").select()
        .eq("post_boosts.status", BoostStatus.ACTIVE)
        .mockResolvedValue({
          data: [
            FeedTestDataFactory.createBoostedPost(seenBoostId, "booster1", testCountry),
            FeedTestDataFactory.createBoostedPost("new_boost_1", "booster2", testCountry)
          ],
          error: null
        });

      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().not("user_id", "in").mockResolvedValue({ data: [], error: null });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      // Should not include the seen boost
      const boostedPosts = result.posts.filter(p => p.feed_type === "boosted");
      expect(boostedPosts.every(p => p.id !== seenBoostId)).toBe(true);
    });
  });

  describe("Feed Caching System", () => {
    it("should return cached feed when available", async () => {
      const userId = "user1";
      const cachedFeed = {
        posts: [FeedTestDataFactory.createPost("cached_post", userId)],
        total: 1,
        composition: { cached: true, counts: { mixed: 1 } }
      };

      mockRedisService.get.mockResolvedValue(cachedFeed);

      const result = await PostService.getFeedPosts(userId, 1, 10);

      expect(result).toEqual(cachedFeed);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("should cache generated feed", async () => {
      const userId = "user1";
      
      // Mock empty cache
      mockRedisService.get.mockResolvedValue(null);
      
      // Setup minimal mocks for feed generation
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      await PostService.getFeedPosts(userId, 1, 10);

      // Should cache the result
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(`feed:user:${userId}`),
        expect.any(Object),
        300 // TTL
      );
    });
  });

  describe("Individual Helper Methods", () => {
    describe("getUserLocationCached", () => {
      it("should return cached location when available", async () => {
        const userId = "user1";
        const cachedLocation = FeedTestDataFactory.createUserLocation(userId, "Bangladesh");
        
        mockRedisService.get.mockResolvedValue(cachedLocation);

        // Access private method through any casting for testing
        const result = await (PostService as any).getUserLocationCached(userId);

        expect(result).toEqual(cachedLocation);
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });

      it("should fetch and cache location when not cached", async () => {
        const userId = "user1";
        const location = FeedTestDataFactory.createUserLocation(userId, "Bangladesh");
        
        mockRedisService.get.mockResolvedValue(null);
        mockSupabase.from("user_locations").select()
          .eq("user_id", userId)
          .eq("is_active", true)
          .single.mockResolvedValue({ data: location, error: null });

        const result = await (PostService as any).getUserLocationCached(userId);

        expect(result).toEqual(location);
        expect(mockRedisService.set).toHaveBeenCalledWith(
          expect.stringContaining(`user_location:${userId}`),
          location,
          3600
        );
      });
    });

    describe("getBoostedPostsCached", () => {
      it("should filter out seen boosts", async () => {
        const userLocation = { country: "Bangladesh", city: "Dhaka" };
        const seenBoosts = ["boost1"];
        const targetCount = 3;

        const boostedPosts = [
          FeedTestDataFactory.createBoostedPost("boost1", "user1", "Bangladesh"),
          FeedTestDataFactory.createBoostedPost("boost2", "user2", "Bangladesh")
        ];

        mockRedisService.get.mockResolvedValue(null);
        mockSupabase.from("posts").select()
          .eq("post_boosts.status", BoostStatus.ACTIVE)
          .eq("post_boosts.country", "Bangladesh")
          .mockResolvedValue({ data: boostedPosts, error: null });

        const result = await (PostService as any).getBoostedPostsCached(
          userLocation,
          targetCount,
          seenBoosts
        );

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("boost2");
      });
    });

    describe("simpleFeedMix", () => {
      it("should prioritize friend posts and fill to limit", async () => {
        const friendsPosts = Array.from({ length: 3 }, (_, i) => 
          FeedTestDataFactory.createPost(`friend_${i}`, "friend1", { feed_type: "friends" })
        );
        
        const boostedPosts = [
          FeedTestDataFactory.createBoostedPost("boost1", "booster1", "Bangladesh")
        ];
        
        const friendLikedPosts = [
          FeedTestDataFactory.createPost("liked1", "user3", { feed_type: "friend_liked" })
        ];
        
        const publicPosts = Array.from({ length: 10 }, (_, i) => 
          FeedTestDataFactory.createPost(`public_${i}`, `user_${i + 10}`, { feed_type: "public" })
        );

        const result = (PostService as any).simpleFeedMix({
          friendsPosts,
          boostedPosts,
          friendLikedPosts,
          publicPosts,
          limit: 10
        });

        expect(result).toHaveLength(10);
        
        // Friend posts should come first
        expect(result[0].feed_type).toBe("friends");
        expect(result[1].feed_type).toBe("friends");
        expect(result[2].feed_type).toBe("friends");
        
        // Should contain all provided friend posts
        const friendPostsInResult = result.filter(p => p.feed_type === "friends");
        expect(friendPostsInResult).toHaveLength(3);
      });
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate relevant caches on new post creation", async () => {
      const userId = "user1";
      const location = { name: "Dhaka", coordinates: { lat: 23.8103, lng: 90.4125 } };

      await (PostService as any).invalidateRelevantFeeds(userId, location);

      expect(mockRedisService.invalidateUserFeed).toHaveBeenCalledWith(userId);
    });

    it("should invalidate friend-liked caches on like action", async () => {
      const userId = "user1";
      const friendIds = ["friend1", "friend2"];

      // Mock getUserFriendsCached
      jest.spyOn(PostService as any, "getUserFriendsCached")
        .mockResolvedValueOnce(friendIds)
        .mockResolvedValueOnce(["user1", "user3"])
        .mockResolvedValueOnce(["user1", "user4"]);

      await PostService.invalidateFriendLikedCache(userId);

      expect(mockRedisService.delete).toHaveBeenCalled();
      expect(mockRedisService.invalidateUserFeed).toHaveBeenCalledTimes(2); // For each friend
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      const userId = "user1";
      
      mockRedisService.get.mockResolvedValue(null);
      mockSupabase.from("user_locations").select().mockResolvedValue({
        data: null,
        error: { message: "Database error" }
      });

      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      const result = await PostService.getFeedPosts(userId, 1, 10);

      // Should still return a result, handling the error gracefully
      expect(result).toBeDefined();
      expect(result.posts).toBeDefined();
    });

    it("should handle Redis errors gracefully", async () => {
      const userId = "user1";
      
      mockRedisService.get.mockRejectedValue(new Error("Redis connection failed"));
      
      // Setup minimal successful database mocks
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      // Should not throw, should still generate feed
      const result = await PostService.getFeedPosts(userId, 1, 10);
      
      expect(result).toBeDefined();
      expect(result.posts).toBeDefined();
    });
  });

  describe("Performance Tests", () => {
    it("should generate feed within reasonable time", async () => {
      const userId = "user1";
      const startTime = Date.now();
      
      // Setup mocks for successful feed generation
      mockRedisService.get.mockResolvedValue(null);
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      await PostService.getFeedPosts(userId, 1, 10);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe("Edge Cases", () => {
    it("should handle very large friend lists", async () => {
      const userId = "user1";
      const largeFriendList = Array.from({ length: 100 }, (_, i) => `friend_${i}`);
      
      mockRedisService.get.mockResolvedValue(null);
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({
        data: largeFriendList.map(friendId => 
          FeedTestDataFactory.createFriendship(userId, friendId)
        ),
        error: null
      });

      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });

      const result = await PostService.getFeedPosts(userId, 1, 10);
      
      expect(result).toBeDefined();
      expect(result.posts).toHaveLength(10);
    });

    it("should handle posts with missing media gracefully", async () => {
      const userId = "user1";
      const postWithMissingMedia = {
        ...FeedTestDataFactory.createPost("post1", "user2"),
        post_media: null,
        users: null
      };

      mockRedisService.get.mockResolvedValue(null);
      mockSupabase.from("user_locations").select().mockResolvedValue({ data: null, error: null });
      mockSupabase.from("friendships").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("posts").select().mockResolvedValue({ data: [], error: null });
      mockSupabase.from("reactions").select().mockResolvedValue({ data: [], error: null });
      
      mockSupabase.from("posts").select()
        .not("user_id", "in")
        .mockResolvedValue({ data: [postWithMissingMedia], error: null });

      const result = await PostService.getFeedPosts(userId, 1, 10);
      
      expect(result).toBeDefined();
      expect(result.posts).toContain(postWithMissingMedia);
    });
  });
});
