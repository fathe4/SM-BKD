import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import {
  Friendship,
  FriendshipStatus,
  FriendSummary,
  FriendshipCreate,
} from "../models/friendship.model";
import { getUserBasicProfile } from "../utils/profileUtils";
// Using string instead of UUID type from crypto to avoid template literal type issues
import { asyncHandler } from "../utils/asyncHandler";

export class FriendshipService {
  /**
   * Send a friend request
   */
  static sendFriendRequest = asyncHandler(
    async (requesterId: string, addresseeId: string): Promise<Friendship> => {
      // Prevent sending friend request to self
      if (requesterId === addresseeId) {
        throw new AppError("You cannot send a friend request to yourself", 400);
      }

      // Check if a friendship already exists in either direction
      const existingFriendship = await this.getFriendshipBetweenUsers(
        requesterId,
        addresseeId
      );

      if (existingFriendship) {
        if (existingFriendship.status === FriendshipStatus.BLOCKED) {
          throw new AppError("Unable to send friend request", 403);
        }

        if (existingFriendship.status === FriendshipStatus.PENDING) {
          // If the current user is the original requester, don't allow duplicate requests
          if (existingFriendship.requester_id === requesterId) {
            throw new AppError("Friend request already sent", 400);
          }

          // If the current user is the addressee of an existing request, accept the friendship
          return await this.updateFriendshipStatus(
            existingFriendship.id,
            FriendshipStatus.ACCEPTED
          );
        }

        if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
          throw new AppError("You are already friends with this user", 400);
        }

        if (existingFriendship.status === FriendshipStatus.REJECTED) {
          // Allow re-sending a request if it was previously rejected
          return await this.updateFriendshipStatus(
            existingFriendship.id,
            FriendshipStatus.PENDING
          );
        }
      }

      // Create a new friendship request
      const friendshipData: FriendshipCreate = {
        requester_id: requesterId,
        addressee_id: addresseeId,
      };

      const { data, error } = await supabaseAdmin!
        .from("friendships")
        .insert({
          ...friendshipData,
          status: FriendshipStatus.PENDING,
        })
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Friendship;
    },
    "Failed to send friend request"
  );

  /**
   * Get friendship between two users
   */
  static getFriendshipBetweenUsers = asyncHandler(
    async (userId1: string, userId2: string): Promise<Friendship | null> => {
      const { data, error } = await supabase
        .from("friendships")
        .select("*")
        .or(
          `and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`
        )
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "no rows returned" - not an error for our purposes
        throw new AppError(error.message, 400);
      }

      return data as Friendship | null;
    },
    "Failed to get friendship between users"
  );

  /**
   * Update friendship status
   */
  static updateFriendshipStatus = asyncHandler(
    async (
      friendshipId: string,
      status: FriendshipStatus
    ): Promise<Friendship> => {
      const { data, error } = await supabaseAdmin!
        .from("friendships")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", friendshipId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Friendship;
    },
    "Failed to update friendship status"
  );

  /**
   * Get friendship by ID
   */
  static getFriendshipById = asyncHandler(
    async (friendshipId: string): Promise<Friendship | null> => {
      const { data, error } = await supabase
        .from("friendships")
        .select("*")
        .eq("id", friendshipId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new AppError(error.message, 400);
      }

      return data as Friendship;
    },
    "Failed to get friendship by ID"
  );

  /**
   * Delete friendship
   */
  static deleteFriendship = asyncHandler(
    async (friendshipId: string): Promise<void> => {
      const { error } = await supabaseAdmin!
        .from("friendships")
        .delete()
        .eq("id", friendshipId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete friendship"
  );

  /**
   * Get user's friendships with pagination and optional status filtering
   */
  static getUserFriendships = asyncHandler(
    async (
      userId: string,
      options: {
        status?: FriendshipStatus;
        page?: number;
        limit?: number;
      } = {}
    ): Promise<{ friendships: FriendSummary[]; total: number }> => {
      const { status, page = 1, limit = 10 } = options;
      const offset = (page - 1) * limit;

      // Start query to get friendships where the user is either requester or addressee
      let query = supabase
        .from("friendships")
        .select(
          `
          id,
          requester_id,
          addressee_id,
          status,
          created_at,
          updated_at
        `,
          { count: "exact" }
        )
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      // Apply status filter if provided
      if (status) {
        query = query.eq("status", status);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      // Execute query
      const { data, error, count } = await query;

      if (error) {
        throw new AppError(error.message, 400);
      }

      if (!data || data.length === 0) {
        return { friendships: [], total: 0 };
      }

      // Transform friendships to include user details
      const friendshipSummaries = await Promise.all(
        data.map(async (friendship) => {
          // Get the ID of the other user in the friendship
          const otherUserId =
            friendship.requester_id === userId
              ? friendship.addressee_id
              : friendship.requester_id;

          // Get the other user's profile details
          const userProfile = await getUserBasicProfile(otherUserId as string);

          return {
            id: userProfile.id,
            username: userProfile.username,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            profile_picture: userProfile.profile_picture,
            friendship_id: friendship.id,
            friendship_status: friendship.status,
            is_requester: friendship.requester_id === userId,
          } as FriendSummary;
        })
      );

      return {
        friendships: friendshipSummaries,
        total: count || 0,
      };
    },
    "Failed to get user friendships"
  );

  /**
   * Get all friend IDs for a user
   * Used for internal service calls, not exposed via API
   */
  static getUserFriendIds = asyncHandler(
    async (userId: string): Promise<string[]> => {
      const { data, error } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", FriendshipStatus.ACCEPTED)
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (error) {
        throw new AppError(error.message, 400);
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Extract the friend IDs
      return data.map((friendship) =>
        friendship.requester_id === userId
          ? friendship.addressee_id
          : friendship.requester_id
      ) as string[];
    },
    "Failed to get user friend IDs"
  );

  /**
   * Check if users are friends
   */
  static checkIfFriends = asyncHandler(
    async (userId1: string, userId2: string): Promise<boolean> => {
      const friendship = await this.getFriendshipBetweenUsers(userId1, userId2);
      return (
        friendship !== null && friendship.status === FriendshipStatus.ACCEPTED
      );
    },
    "Failed to check if users are friends"
  );

  /**
   * Get mutual friends between two users
   */
  static getMutualFriends = asyncHandler(
    async (
      userId1: string,
      userId2: string,
      options: {
        page?: number;
        limit?: number;
      } = {}
    ): Promise<{ mutualFriends: FriendSummary[]; total: number }> => {
      const { page = 1, limit = 10 } = options;

      // Get friend IDs for both users
      const user1FriendIds = await this.getUserFriendIds(userId1);
      const user2FriendIds = await this.getUserFriendIds(userId2);

      if (user1FriendIds.length === 0 || user2FriendIds.length === 0) {
        return { mutualFriends: [], total: 0 };
      }

      // Find mutual friends (intersection of the two arrays)
      const mutualFriendIds = user1FriendIds.filter((id) =>
        user2FriendIds.includes(id)
      );

      if (mutualFriendIds.length === 0) {
        return { mutualFriends: [], total: 0 };
      }

      // Calculate pagination
      const offset = (page - 1) * limit;
      const paginatedIds = mutualFriendIds.slice(offset, offset + limit);

      // Get user details for each mutual friend
      const mutualFriends = await Promise.all(
        paginatedIds.map(async (friendId) => {
          // Get user profile
          const userProfile = await getUserBasicProfile(friendId);

          // Get friendship details with the current user
          const friendship = await this.getFriendshipBetweenUsers(
            userId1,
            friendId
          );

          return {
            id: userProfile.id,
            username: userProfile.username,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            profile_picture: userProfile.profile_picture,
            friendship_id: friendship?.id,
            friendship_status: friendship?.status || FriendshipStatus.ACCEPTED,
          } as FriendSummary;
        })
      );

      return {
        mutualFriends,
        total: mutualFriendIds.length,
      };
    },
    "Failed to get mutual friends"
  );

  /**
   * Get friend suggestions for a user
   */
  static getFriendSuggestions = asyncHandler(
    async (
      userId: string,
      options: {
        page?: number;
        limit?: number;
      } = {}
    ): Promise<{ suggestions: FriendSummary[]; total: number }> => {
      const { page = 1, limit = 10 } = options;
      const offset = (page - 1) * limit;

      // Get user's current friends
      const userFriendIds = await this.getUserFriendIds(userId);

      // Get friends of friends
      let friendOfFriendIds: string[] = [];
      if (userFriendIds.length > 0) {
        for (const friendId of userFriendIds) {
          const friendsFriends = await this.getUserFriendIds(friendId);
          friendOfFriendIds = [...friendOfFriendIds, ...friendsFriends];
        }
      }

      // Filter out existing friends and the user themselves
      friendOfFriendIds = friendOfFriendIds.filter(
        (id) => !userFriendIds.includes(id) && id !== userId
      );

      // Remove duplicates
      friendOfFriendIds = [...new Set(friendOfFriendIds)];

      // If we have no suggestions via friends of friends, get some random users
      if (friendOfFriendIds.length === 0) {
        const { data, error } = await supabase
          .from("users")
          .select("id")
          .neq("id", userId)
          .not("id", "in", `(${userFriendIds.join(",")})`)
          .limit(limit);

        if (error) {
          throw new AppError(error.message, 400);
        }

        friendOfFriendIds = data.map((user) => user.id);
      }

      // Apply pagination
      const total = friendOfFriendIds.length;
      const paginatedIds = friendOfFriendIds.slice(offset, offset + limit);

      // Get user details for each suggestion
      const suggestions = await Promise.all(
        paginatedIds.map(async (friendId) => {
          // Get user profile
          const userProfile = await getUserBasicProfile(friendId);

          return {
            id: userProfile.id,
            username: userProfile.username,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            profile_picture: userProfile.profile_picture,
          } as FriendSummary;
        })
      );

      return {
        suggestions,
        total,
      };
    },
    "Failed to get friend suggestions"
  );
}
