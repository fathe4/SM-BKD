/* eslint-disable indent */
import { UUID } from "crypto";
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import {
  Chat,
  ChatCreate,
  ChatParticipantCreate,
  ChatSummary,
  ChatUpdate,
  createChatResponse,
  MessageWithUser,
} from "../models/chat.model";
import { asyncHandler } from "../utils/asyncHandler";
import { FriendshipService } from "./friendshipService";
import { PrivacySettingsService } from "./privacySettingsService";
import { ChatParticipantDetails } from "../types/models";
import { MemberRole } from "../models";
import { redisService } from "./redis.service";

export class ChatService {
  static findChatByContext = async (
    context_type: string,
    context_id?: string,
  ) => {
    const query = supabaseAdmin!
      .from("chats")
      .select("*")
      .eq("context_type", context_type);

    if (context_id) {
      query.eq("context_id", context_id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw new AppError(error.message, 400);

    return data;
  };

  /**
   * Finds an existing direct chat between two users, if one exists.
   *
   * Purpose:
   * - Ensures there is only one direct chat per user pair.
   * - Used to prevent duplicate direct chats when creating a new one.
   *
   * How it works:
   * - Filters chats where `context_type = 'direct'`.
   * - Joins `chat_participants` to ensure both users are participants.
   * - Uses SQL grouping (GROUP BY + HAVING) to guarantee that both users are in the same chat.
   * - Returns the first matching chat, or null if no chat exists.
   *
   * Returns:
   * - Chat object if found
   * - null if no direct chat exists between the users
   *
   * Notes:
   * - Efficient even at scale because the database handles participant filtering.
   * - Works for exactly 2 participants; for group chats with more users, use a different service.
   * - Can be extended for participant hashes or multi-user direct chats if needed in the future.
   */
  static findDirectChat = async (userA: string, userB: string) => {
    console.log(userA, userB);

    const { data, error } = await supabaseAdmin!.rpc("find_direct_chat", {
      user_a: userA,
      user_b: userB,
    });

    if (error) throw new AppError(error.message, 400);

    return data?.[0] ?? null;
  };

  /**
   * Create a new chat
   */
  static createChat = asyncHandler(
    async (
      chatData: ChatCreate,
      participants: string[],
    ): Promise<createChatResponse> => {
      // 1. Handle direct duplicate (2 participants only)
      if (chatData.context_type === "direct") {
        if (participants.length !== 1) {
          throw new AppError(
            "Direct chat must have exactly 1 participants",
            400,
          );
        }

        const existingDirectChat = await ChatService.findDirectChat(
          chatData.creator_id!,
          participants[0],
        );
        if (existingDirectChat) {
          return { chat: existingDirectChat as Chat, isDuplicate: true };
        }
      }

      // 2. Check for duplicate marketplace chat
      if (chatData.context_type === "marketplace") {
        const existingChat = await ChatService.findChatByContext(
          "marketplace",
          chatData.context_id,
        );

        if (existingChat)
          return { chat: existingChat as Chat, isDuplicate: true };
      }

      // 3. Insert chat
      const { data: chat, error: chatError } = await supabaseAdmin!
        .from("chats")
        .insert(chatData)
        .select()
        .single();

      if (chatError) {
        throw new AppError(chatError.message, 400);
      }

      // 4. Role assignment
      // eslint-disable-next-line prefer-const
      let participantsWithChatId = participants.map((userId) => ({
        user_id: userId,
        chat_id: chat.id,
        role: MemberRole.MEMBER,
      }));

      // Add the creator if not already included
      if (
        !participantsWithChatId.find((p) => p.user_id === chatData.creator_id)
      ) {
        participantsWithChatId.push({
          user_id: chatData.creator_id!,
          chat_id: chat.id,
          role:
            chatData.context_type === "group"
              ? MemberRole.ADMIN
              : MemberRole.MEMBER,
        });
      }

      // 5. Insert participants (with rollback on error)
      const { error: participantsError } = await supabaseAdmin!
        .from("chat_participants")
        .insert(participantsWithChatId);

      if (participantsError) {
        // rollback
        await supabaseAdmin!.from("chats").delete().eq("id", chat.id);
        throw new AppError(participantsError.message, 400);
      }
      console.log(chat, "chat");

      return { chat: chat as Chat, isDuplicate: false };
    },
    "Failed to create chat",
  );

  /**
   * Get chat by ID - with caching
   */
  static getChatById = asyncHandler(
    async (chatId: string, userId: string): Promise<Chat | null> => {
      // First verify the user is a participant
      const isParticipant = await this.isUserChatParticipant(userId, chatId);

      if (!isParticipant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      // Check cache
      const cacheKey = `chat:${chatId}`;
      const cached = await redisService.get<Chat>(cacheKey);
      console.log(cached, "cached");

      if (cached) return cached;

      // Query database
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new AppError(error.message, 400);
      }

      // Cache the result
      if (data) {
        await redisService.set(cacheKey, data, 300); // 5 minutes
      }

      return data as Chat;
    },
    "Failed to get chat",
  );
  // /**
  //  * Get all chats for a user with chat summaries
  //  */
  static getUserChats = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 20,
    ): Promise<{ chats: ChatSummary[]; total: number }> => {
      console.log("getUserChats" + new Date());

      // Try to get from Redis cache first
      const cachedResult = await redisService.getChatList(userId);
      if (cachedResult) {
        console.log(
          "✅ Cache hit: Returning cached chat list for user",
          userId,
        );
        return cachedResult;
      }

      console.log(
        "❌ Cache miss: Fetching chat list from database for user",
        userId,
      );

      const offset = (page - 1) * limit;

      // Get chats where the user is a participant
      const {
        data: chatParticipations,
        error: participationError,
        count,
      } = await supabase
        .from("chat_participants")
        .select("chat_id", { count: "exact" })
        .eq("user_id", userId)
        .range(offset, offset + limit - 1);

      if (participationError) {
        throw new AppError(participationError.message, 400);
      }

      if (!chatParticipations || chatParticipations.length === 0) {
        return { chats: [], total: 0 };
      }

      const chatIds = chatParticipations.map((p) => p.chat_id);

      // Get chat details with last message
      const chatSummaries = await Promise.all(
        chatIds.map(async (chatId) => {
          return await this.getChatSummary(chatId, userId);
        }),
      );

      // Sort by last message timestamp (most recent first)
      chatSummaries.sort((a, b) => {
        const dateA = a.last_message?.created_at
          ? new Date(a.last_message.created_at)
          : new Date(0);
        const dateB = b.last_message?.created_at
          ? new Date(b.last_message.created_at)
          : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      const result = {
        chats: chatSummaries,
        total: count || 0,
      };

      // Cache the result
      try {
        await redisService.setChatList(userId, result.chats, result.total);
        console.log("✅ Cached chat list for user", userId);
      } catch (error) {
        console.log("❌ Failed to cache chat list:", error);
      }

      console.log("get user chats" + new Date());
      return result;
    },
    "Failed to get user chats",
  );

  // /**
  //  * Get a summary of a chat with last message and participants
  //  */
  static getChatSummary = asyncHandler(
    async (chatId: string, userId: string): Promise<ChatSummary> => {
      console.log("is it a chat header");

      // Get the chat details
      const { data: chat, error: chatError } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (chatError) {
        throw new AppError(chatError.message, 400);
      }

      // Get participants
      const { data: participantsData, error: participantsError } =
        await supabase
          .from("chat_participants")
          .select(
            `
          id,
          user_id,
          users!inner (
            id,
            username,
            profile_picture
          )
        `,
          )
          .eq("chat_id", chatId);

      if (participantsError) {
        throw new AppError(participantsError.message, 400);
      }

      // Format participants with respect to privacy settings
      const participants = await Promise.all(
        participantsData.map(async (p: any) => {
          const participantId = p.user_id;

          // If it's the current user, include their info
          if (participantId === userId) {
            return {
              id: p.users.id,
              username: p.users.username,
              profile_picture: p.users.profile_picture,
            };
          }

          // Check privacy settings for other users
          const settings =
            await PrivacySettingsService.getUserPrivacySettings(participantId);
          const profileVisibility =
            settings.settings.baseSettings.profileVisibility;

          // If profile is private, only show username
          if (profileVisibility === "private") {
            return {
              id: p.users.id,
              username: p.users.username,
              profile_picture: null,
            };
          }

          // If profile is friends-only, check friendship
          if (profileVisibility === "friends") {
            const areFriends = await FriendshipService.checkIfUsersAreFriends(
              userId as UUID,
              participantId,
            );
            if (!areFriends) {
              return {
                id: p.users.id,
                username: p.users.username,
                profile_picture: null,
              };
            }
          }

          // Otherwise return full info
          return {
            id: p.users.id,
            username: p.users.username,
            profile_picture: p.users.profile_picture,
          };
        }),
      );

      // Get last message
      const { data: lastMessageData } = (await supabase
        .from("messages")
        .select(
          `
          id,
          content,
          created_at,
          sender_id,
          users:sender_id (
            username
          )
        `,
        )
        .eq("chat_id", chatId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()) as { data: MessageWithUser | null; error: any };

      // Count unread messages
      const { count: unreadCount, error: unreadError } = await supabase
        .from("messages")
        .select("id", { count: "exact" })
        .eq("chat_id", chatId)
        .eq("is_read", false)
        .neq("sender_id", userId);

      if (unreadError) {
        throw new AppError(unreadError.message, 400);
      }

      // Format the chat summary
      return {
        ...chat,
        name: getChatName(chat, participants, userId),
        is_group_chat: chat.is_group_chat,
        avatar: getChatAvatar(chat, participants, userId),
        last_message: lastMessageData
          ? {
              id: lastMessageData.id,
              content: lastMessageData.content,
              sender_name: lastMessageData.users?.username || "Unknown",
              created_at: new Date(lastMessageData.created_at),
            }
          : undefined,
        unread_count: unreadCount || 0,
        participants,
      };
    },
    "Failed to get chat summary",
  );

  /**
   * Update a chat
   */
  static updateChat = asyncHandler(
    async (
      chatId: string,
      userId: string,
      updateData: ChatUpdate,
    ): Promise<Chat> => {
      // Verify the user is a participant with admin role
      const isAdmin = await this.isUserChatAdmin(userId, chatId);

      if (!isAdmin) {
        throw new AppError(
          "You don't have permission to update this chat",
          403,
        );
      }

      const { data, error } = await supabaseAdmin!
        .from("chats")
        .update(updateData)
        .eq("id", chatId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Chat;
    },
    "Failed to update chat",
  );

  /**
   * Add participants to a chat
   */
  static addChatParticipants = asyncHandler(
    async (
      chatId: string,
      userId: string,
      newParticipants: ChatParticipantCreate[],
    ): Promise<void> => {
      // Verify the user is a participant with admin role for group chats
      const chat = await this.getChatById(chatId, userId);

      if (!chat) {
        throw new AppError("Chat not found", 404);
      }

      if (chat.is_group_chat) {
        const isAdmin = await this.isUserChatAdmin(userId, chatId);
        if (!isAdmin) {
          throw new AppError(
            "You don't have permission to add participants to this chat",
            403,
          );
        }
      } else {
        // For direct chats, only allow adding if there are fewer than 2 participants
        const currentParticipantCount =
          await this.getChatParticipantCount(chatId);
        if (currentParticipantCount >= 2) {
          throw new AppError(
            "Cannot add more participants to a direct chat",
            400,
          );
        }
      }

      // Add participants
      const participantsWithChatId = newParticipants.map((p) => ({
        ...p,
        chat_id: chatId,
      }));

      const { error } = await supabaseAdmin!
        .from("chat_participants")
        .insert(participantsWithChatId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to add chat participants",
  );

  /**
   * Remove a participant from a chat
   */
  static removeChatParticipant = asyncHandler(
    async (
      chatId: string,
      userId: string,
      participantId: string,
    ): Promise<void> => {
      const chat = await this.getChatById(chatId, userId);

      if (!chat) {
        throw new AppError("Chat not found", 404);
      }

      // Check if user has permission to remove participants
      const canRemove = await this.canRemoveParticipant(
        chatId,
        userId,
        participantId,
      );

      if (!canRemove) {
        throw new AppError(
          "You don't have permission to remove this participant",
          403,
        );
      }

      const { error } = await supabaseAdmin!
        .from("chat_participants")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", participantId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to remove chat participant",
  );

  /**
   * Leave a chat
   */
  static leaveChat = asyncHandler(
    async (chatId: string, userId: string): Promise<void> => {
      // Verify the user is a participant
      const isParticipant = await this.isUserChatParticipant(userId, chatId);

      if (!isParticipant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      const { error } = await supabaseAdmin!
        .from("chat_participants")
        .delete()
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      if (error) {
        throw new AppError(error.message, 400);
      }

      // If this was a direct chat or there are no participants left, delete the chat
      const remainingParticipants = await this.getChatParticipantCount(chatId);

      if (remainingParticipants === 0) {
        await this.deleteChat(chatId);
      }
    },
    "Failed to leave chat",
  );

  /**
   * Delete a chat (only for admins or if all participants have left)
   */
  static deleteChat = asyncHandler(
    async (chatId: string, userId?: string): Promise<void> => {
      // If userId is provided, verify they're an admin
      if (userId) {
        const isAdmin = await this.canUserDeleteChat(userId, chatId);
        if (!isAdmin) {
          throw new AppError(
            "You don't have permission to delete this chat",
            403,
          );
        }
      }

      // Delete all messages in the chat
      const { error: messagesError } = await supabaseAdmin!
        .from("messages")
        .delete()
        .eq("chat_id", chatId);

      if (messagesError) {
        throw new AppError(messagesError.message, 400);
      }

      // Delete all participants
      const { error: participantsError } = await supabaseAdmin!
        .from("chat_participants")
        .delete()
        .eq("chat_id", chatId);

      if (participantsError) {
        throw new AppError(participantsError.message, 400);
      }

      // Delete the chat
      const { error } = await supabaseAdmin!
        .from("chats")
        .delete()
        .eq("id", chatId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete chat",
  );

  /**
   * Helper function to check if a user is a participant in a chat
   */
  static isUserChatParticipant = asyncHandler(
    async (userId: string, chatId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select("id")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return !!data;
    },
    "Failed to check chat participation",
  );

  /**
   * Helper function to check if a user is an admin in a chat
   */
  static isUserChatAdmin = asyncHandler(
    async (userId: string, chatId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .eq("role", "member")
        .maybeSingle();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return !!data;
    },
    "Failed to check chat admin status",
  );

  static canUserDeleteChat = asyncHandler(
    async (userId: string, chatId: string): Promise<boolean> => {
      // Get chat info
      const chat = await this.getChatById(chatId, userId);

      if (!chat) throw new AppError("No Chat Found", 400);

      // Get user role in this chat
      const { data: participant, error: participantError } = await supabase
        .from("chat_participants")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();

      if (participantError) {
        throw new AppError(participantError.message, 400);
      }

      if (!participant) {
        return false; // user is not part of the chat
      }

      const role = participant.role;

      // --- RULES based on context_type ---
      switch (chat.context_type) {
        case "direct":
          // in a direct message, either user can "delete" (really just hide for themselves)
          return true;

        case "group":
          // only admin or owner can delete the entire group chat
          return role === "admin";

        case "marketplace":
          // e.g. only the "owner" of the marketplace context_id (maybe a product or listing) can delete
          return role === "member";

        default:
          // fallback: require admin/owner
          return role === "admin" || role === "member";
      }
    },
    "Failed to check chat deletion permission",
  );

  /**
   * Helper function to get the count of participants in a chat
   */
  static getChatParticipantCount = asyncHandler(
    async (chatId: string): Promise<number> => {
      const { count, error } = await supabase
        .from("chat_participants")
        .select("id", { count: "exact" })
        .eq("chat_id", chatId);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return count || 0;
    },
    "Failed to get participant count",
  );

  /**
   * Get detailed participants for a chat
   */
  static getChatParticipants = asyncHandler(
    async (
      chatId: string,
      options: {
        page?: number;
        limit?: number;
      } = {},
    ): Promise<{
      participants: ChatParticipantDetails[];
      total: number;
    }> => {
      const { page = 1, limit = 20 } = options;
      const offset = (page - 1) * limit;

      // Fetch participants with user details
      const { data, error, count } = await supabase
        .from("chat_participants")
        .select(
          `
            id,
            chat_id,
            user_id,
            role,
            joined_at,
            last_read,
            users!inner (
              id,
              username, 
              first_name, 
              last_name, 
              profile_picture,
              is_verified
            )
          `,
          { count: "exact" },
        )
        .eq("chat_id", chatId)
        .range(offset, offset + limit - 1)
        .order("joined_at", { ascending: true });

      if (error) {
        throw new AppError(error.message, 400);
      }

      // Transform data to match the ChatParticipantDetails interface
      const participants = data.map((participant: any) => ({
        id: participant.id,
        chat_id: participant.chat_id,
        user_id: participant.user_id,
        role: participant.role,
        joined_at: participant.joined_at,
        last_read: participant.last_read,
        user: {
          id: participant.users.id,
          username: participant.users.username,
          first_name: participant.users.first_name,
          last_name: participant.users.last_name,
          profile_picture: participant.users.profile_picture,
          is_verified: participant.users.is_verified,
        },
      }));

      return {
        participants,
        total: count || 0,
      };
    },
    "Failed to get chat participants",
  );

  /**
   * Helper function to check if a user can remove a participant
   */
  static canRemoveParticipant = asyncHandler(
    async (
      chatId: string,
      userId: string,
      participantId: string,
    ): Promise<boolean> => {
      // Users can remove themselves
      if (userId === participantId) {
        return true;
      }

      // Group chat admins can remove anyone
      const isAdmin = await this.isUserChatAdmin(userId, chatId);
      if (isAdmin) {
        return true;
      }

      return false;
    },
    "Failed to check removal permission",
  );

  static async findGroupChatByNameAndParticipants(
    name: string,
    participants: string[],
  ) {
    // 1. Find all group chats with the given name
    const { data: chats, error } = await supabase
      .from("chats")
      .select("id")
      .eq("is_group_chat", true)
      .eq("name", name);

    if (error) throw new AppError(error.message, 400);

    // 2. For each chat, fetch its participants and compare
    for (const chat of chats) {
      const { data: chatParticipants, error: participantsError } =
        await supabase
          .from("chat_participants")
          .select("user_id")
          .eq("chat_id", chat.id);

      if (participantsError) throw new AppError(participantsError.message, 400);

      const chatParticipantIds = chatParticipants.map((p: any) => p.user_id);
      // Compare as sets (order-insensitive)
      if (
        chatParticipantIds.length === participants.length &&
        chatParticipantIds.every((id: string) => participants.includes(id)) &&
        participants.every((id: string) => chatParticipantIds.includes(id))
      ) {
        // Return the full chat object (fetch from chats table)
        const { data: fullChat, error: fullChatError } = await supabase
          .from("chats")
          .select("*")
          .eq("id", chat.id)
          .single();
        if (fullChatError) throw new AppError(fullChatError.message, 400);
        return fullChat;
      }
    }
    return null;
  }
}

/**
 * Helper function to get the chat name
 */
function getChatName(
  chat: Chat,
  participants: any[],
  currentUserId: string,
): string {
  if (chat.name) {
    return chat.name;
  }

  if (!chat.is_group_chat) {
    // For direct chats, use the other participant's name
    const otherParticipant = participants.find((p) => p.id !== currentUserId);
    return otherParticipant ? otherParticipant.username : "Chat";
  }

  // Fallback for group chats with no name
  return "Group Chat";
}

/**
 * Helper function to get the chat avatar
 */
function getChatAvatar(
  chat: Chat,
  participants: any[],
  currentUserId: string,
): string | undefined {
  if (chat.avatar) {
    return chat.avatar;
  }

  if (!chat.is_group_chat) {
    // For direct chats, use the other participant's avatar
    const otherParticipant = participants.find((p) => p.id !== currentUserId);
    return otherParticipant?.profile_picture || undefined; // Return undefined instead of null
  }

  return undefined; // Return undefined instead of null
}
