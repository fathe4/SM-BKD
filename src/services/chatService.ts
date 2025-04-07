// src/services/chatService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { UUID } from "crypto";
import { SocketService } from "./socketService";
import { asyncHandler } from "../utils/asyncHandler";
import { UserService } from "./userService";

export interface ChatMessage {
  id: UUID;
  chat_id: UUID;
  sender_id: UUID;
  content?: string;
  media?: string[]; // Array of media URLs
  is_message_deleted: boolean;
  is_message_auto_deleted: boolean;
  is_deprecated_deleted: boolean;
  is_read: boolean;
  created_at: Date;
  auto_delete_at?: Date;
  sender?: {
    username: string;
    profile_picture?: string;
  };
}

export interface ChatMessageCreate {
  chat_id: UUID;
  sender_id: UUID;
  content?: string;
  media?: string[];
  auto_delete_at?: Date | null;
  auto_delete_hours?: number; // Number of hours after which the message should be deleted
}

export interface ChatMessageUpdate {
  is_message_deleted?: boolean;
  is_message_auto_deleted?: boolean;
  is_read?: boolean;
  auto_delete_at?: Date | null;
}

export interface ChatRoom {
  id: UUID;
  name?: string;
  is_group_chat: boolean;
  created_at: Date;
  participants: ChatParticipant[];
  last_message?: ChatMessage;
  unread_count?: number;
}

export interface ChatParticipant {
  id: UUID;
  user_id: UUID;
  chat_id: UUID;
  role: string;
  joined_at: Date;
  last_read?: Date;
  user?: {
    username: string;
    first_name: string;
    last_name: string;
    profile_picture?: string;
  };
}

export enum ChatParticipantRole {
  ADMIN = "admin",
  MEMBER = "member",
}

/**
 * Service for chat operations
 */
export class ChatService {
  /**
   * Create a new chat room
   */
  static createChat = asyncHandler(
    async (
      creatorId: UUID,
      participantIds: UUID[],
      isGroupChat: boolean = false,
      name?: string
    ): Promise<ChatRoom> => {
      // Make sure creator is included in participants
      if (!participantIds.includes(creatorId)) {
        participantIds.push(creatorId);
      }

      if (!isGroupChat && participantIds.length !== 2) {
        throw new AppError(
          "One-to-one chats must have exactly 2 participants",
          400
        );
      }

      // Start a transaction
      const { data: chat, error: chatError } = await supabaseAdmin!
        .from("chats")
        .insert({
          is_group_chat: isGroupChat,
          name: isGroupChat ? name : undefined,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (chatError) {
        throw new AppError(`Failed to create chat: ${chatError.message}`, 400);
      }

      // Add participants
      const participants = participantIds.map((userId, index) => ({
        chat_id: chat.id,
        user_id: userId,
        role:
          userId === creatorId || index === 0
            ? ChatParticipantRole.ADMIN
            : ChatParticipantRole.MEMBER,
        joined_at: new Date().toISOString(),
      }));

      const { error: participantError } = await supabaseAdmin!
        .from("chat_participants")
        .insert(participants);

      if (participantError) {
        // If adding participants fails, try to clean up the chat
        await supabaseAdmin!.from("chats").delete().eq("id", chat.id);
        throw new AppError(
          `Failed to add participants: ${participantError.message}`,
          400
        );
      }

      // For one-to-one chats, generate the chat name based on the other participant
      let chatName = name;
      if (!isGroupChat) {
        const otherParticipantId = participantIds.find(
          (id) => id !== creatorId
        );
        if (otherParticipantId) {
          const otherUser = await UserService.findUserById(otherParticipantId);
          if (otherUser) {
            chatName = `${otherUser.first_name} ${otherUser.last_name}`;
          }
        }
      }

      return {
        ...chat,
        name: chatName,
        participants: participants.map((p) => ({
          ...p,
          id: p.user_id as UUID, // Temporary ID until we fetch the real one
        })),
      } as ChatRoom;
    },
    "Failed to create chat"
  );

  /**
   * Send a message in a chat
   */
  static sendMessage = asyncHandler(
    async (messageData: ChatMessageCreate): Promise<ChatMessage> => {
      // Calculate auto-delete time if specified
      let autoDeleteAt = messageData.auto_delete_at;

      if (messageData.auto_delete_hours && messageData.auto_delete_hours > 0) {
        autoDeleteAt = new Date();
        autoDeleteAt.setHours(
          autoDeleteAt.getHours() + messageData.auto_delete_hours
        );
      }

      // Prepare the message data for insertion
      const messageToInsert = {
        chat_id: messageData.chat_id,
        sender_id: messageData.sender_id,
        content: messageData.content,
        media: messageData.media,
        auto_delete_at: autoDeleteAt,
        is_message_deleted: false,
        is_message_auto_deleted: false,
        is_read: false,
        created_at: new Date().toISOString(),
      };

      // Insert the message
      const { data, error } = await supabaseAdmin!
        .from("messages")
        .insert(messageToInsert)
        .select("*, sender:users!inner(username, profile_picture)")
        .single();

      if (error) {
        throw new AppError(`Failed to send message: ${error.message}`, 400);
      }

      // Emit the message to all participants in the chat
      SocketService.emitNewMessage(messageData.chat_id.toString(), data);

      return data as unknown as ChatMessage;
    },
    "Failed to send message"
  );

  /**
   * Get messages for a chat with pagination
   */
  static getMessages = asyncHandler(
    async (
      chatId: UUID,
      userId: UUID,
      page: number = 1,
      limit: number = 20
    ): Promise<{ messages: ChatMessage[]; total: number }> => {
      // Check if user is a participant in this chat
      const { data: participant, error: participantError } = await supabase
        .from("chat_participants")
        .select("*")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .single();

      if (participantError || !participant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Get messages that are not deleted
      const { data, error, count } = await supabase
        .from("messages")
        .select("*, sender:users!inner(username, profile_picture)", {
          count: "exact",
        })
        .eq("chat_id", chatId)
        .eq("is_message_deleted", false)
        .eq("is_deprecated_deleted", false)
        .order("created_at", { ascending: false }) // Newest first
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(`Failed to get messages: ${error.message}`, 400);
      }

      // Update last_read for this participant if there are messages
      if (data && data.length > 0) {
        await supabaseAdmin!
          .from("chat_participants")
          .update({ last_read: new Date().toISOString() })
          .eq("id", participant.id);
      }

      return {
        messages: data as unknown as ChatMessage[],
        total: count || 0,
      };
    },
    "Failed to get messages"
  );

  /**
   * Delete a message (mark as deleted)
   */
  static deleteMessage = asyncHandler(
    async (
      messageId: UUID,
      userId: UUID,
      isAutoDelete: boolean = false
    ): Promise<void> => {
      // Check if the message exists and belongs to the user
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .select("chat_id, sender_id")
        .eq("id", messageId)
        .single();

      if (messageError || !message) {
        throw new AppError("Message not found", 404);
      }

      if (message.sender_id !== userId) {
        throw new AppError("You can only delete your own messages", 403);
      }

      // Update the message
      const updateData: ChatMessageUpdate = isAutoDelete
        ? { is_message_auto_deleted: true }
        : { is_message_deleted: true };

      const { error } = await supabaseAdmin!
        .from("messages")
        .update(updateData)
        .eq("id", messageId);

      if (error) {
        throw new AppError(`Failed to delete message: ${error.message}`, 400);
      }

      // Emit message deleted event
      SocketService.emitMessageDeleted(message.chat_id, messageId.toString());
    },
    "Failed to delete message"
  );

  /**
   * Toggle auto-deletion setting for a user's messages
   */
  static toggleAutoDelete = asyncHandler(
    async (
      userId: UUID,
      enable: boolean,
      deleteAfterHours?: number
    ): Promise<void> => {
      // Get all of the user's messages that don't have auto-delete set
      if (enable) {
        if (!deleteAfterHours || deleteAfterHours <= 0) {
          throw new AppError(
            "Auto-delete time must be specified and greater than 0",
            400
          );
        }

        // Calculate the auto-delete time
        const autoDeleteAt = new Date();
        autoDeleteAt.setHours(autoDeleteAt.getHours() + deleteAfterHours);

        // Update all messages that don't have auto_delete_at set
        const { error } = await supabaseAdmin!
          .from("messages")
          .update({ auto_delete_at: autoDeleteAt.toISOString() })
          .eq("sender_id", userId)
          .is("auto_delete_at", null)
          .eq("is_message_deleted", false)
          .eq("is_message_auto_deleted", false);

        if (error) {
          throw new AppError(
            `Failed to enable auto-delete: ${error.message}`,
            400
          );
        }
      } else {
        // Remove auto-delete setting from all messages
        const { error } = await supabaseAdmin!
          .from("messages")
          .update({ auto_delete_at: null })
          .eq("sender_id", userId)
          .not("auto_delete_at", "is", null);

        if (error) {
          throw new AppError(
            `Failed to disable auto-delete: ${error.message}`,
            400
          );
        }
      }

      // Update user settings (will be implemented later)
    },
    "Failed to toggle auto-delete"
  );

  /**
   * Get all media URLs for a chat
   */
  static getMediaUrls = asyncHandler(
    async (chatId: UUID, userId: UUID): Promise<string[]> => {
      // Check if user is a participant in this chat
      const { data: participant, error: participantError } = await supabase
        .from("chat_participants")
        .select("*")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .single();

      if (participantError || !participant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      // Get all messages that have media and are not deleted
      const { data, error } = await supabase
        .from("messages")
        .select("media")
        .eq("chat_id", chatId)
        .eq("is_message_deleted", false)
        .eq("is_deprecated_deleted", false)
        .not("media", "is", null);

      if (error) {
        throw new AppError(`Failed to get media: ${error.message}`, 400);
      }

      // Extract all media URLs and flatten the array
      return data
        .filter((msg) => msg.media && Array.isArray(msg.media))
        .flatMap((msg) => msg.media);
    },
    "Failed to get media URLs"
  );

  /**
   * Get user's chats with last message and unread count
   */
  static getUserChats = asyncHandler(
    async (userId: UUID): Promise<ChatRoom[]> => {
      // Get all chats the user is participating in
      const { data: participations, error: participationsError } =
        await supabase
          .from("chat_participants")
          .select("chat_id, role, last_read")
          .eq("user_id", userId);

      if (participationsError) {
        throw new AppError(
          `Failed to get user chats: ${participationsError.message}`,
          400
        );
      }

      if (!participations || participations.length === 0) {
        return [];
      }

      const chatIds = participations.map((p) => p.chat_id);

      // Get basic chat info
      const { data: chats, error: chatsError } = await supabase
        .from("chats")
        .select(
          `
          *,
          participants:chat_participants(
            id,
            user_id,
            role,
            joined_at,
            last_read,
            user:users(username, first_name, last_name, profile_picture)
          )
        `
        )
        .in("id", chatIds);

      if (chatsError) {
        throw new AppError(`Failed to get chats: ${chatsError.message}`, 400);
      }

      // Get the last message for each chat
      const lastMessagesPromises = chatIds.map(async (chatId) => {
        const { data: messages } = await supabase
          .from("messages")
          .select("*, sender:users!inner(username, profile_picture)")
          .eq("chat_id", chatId)
          .eq("is_message_deleted", false)
          .eq("is_deprecated_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1);

        return {
          chatId,
          lastMessage: messages && messages.length > 0 ? messages[0] : null,
        };
      });

      const lastMessagesResults = await Promise.all(lastMessagesPromises);
      const lastMessagesMap = new Map(
        lastMessagesResults.map((result) => [result.chatId, result.lastMessage])
      );

      // Get unread messages count for each chat
      const unreadCountPromises = chatIds.map(async (chatId) => {
        const participation = participations.find((p) => p.chat_id === chatId);
        const lastRead = participation?.last_read;

        if (!lastRead) {
          // If no last_read timestamp, count all messages
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact" })
            .eq("chat_id", chatId)
            .eq("is_message_deleted", false)
            .eq("is_deprecated_deleted", false)
            .neq("sender_id", userId);

          return { chatId, count: count || 0 };
        } else {
          // Count messages after last_read timestamp
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact" })
            .eq("chat_id", chatId)
            .eq("is_message_deleted", false)
            .eq("is_deprecated_deleted", false)
            .neq("sender_id", userId)
            .gt("created_at", lastRead);

          return { chatId, count: count || 0 };
        }
      });

      const unreadCountsResults = await Promise.all(unreadCountPromises);
      const unreadCountsMap = new Map(
        unreadCountsResults.map((result) => [result.chatId, result.count])
      );

      // Generate chat names for one-to-one chats
      const enrichedChats = chats.map((chat) => {
        let chatName = chat.name;

        // For one-to-one chats, use the other participant's name
        if (!chat.is_group_chat && (!chatName || chatName.trim() === "")) {
          const otherParticipant = chat.participants.find(
            (p: any) => p.user_id !== userId
          );

          if (otherParticipant && otherParticipant.user) {
            chatName = `${otherParticipant.user.first_name} ${otherParticipant.user.last_name}`;
          }
        }

        return {
          ...chat,
          name: chatName,
          last_message: lastMessagesMap.get(chat.id) || undefined,
          unread_count: unreadCountsMap.get(chat.id) || 0,
        };
      });

      return enrichedChats as unknown as ChatRoom[];
    },
    "Failed to get user chats"
  );

  /**
   * Process auto-deletion for messages
   * This will be called by a scheduled job/cron
   */
  static processAutoDeleteMessages = asyncHandler(
    async (batchSize: number = 100): Promise<number> => {
      // Get messages that are due for auto-deletion
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id")
        .lte("auto_delete_at", now)
        .eq("is_message_deleted", false)
        .eq("is_message_auto_deleted", false)
        .limit(batchSize);

      if (error) {
        throw new AppError(
          `Failed to get messages for auto-deletion: ${error.message}`,
          400
        );
      }

      if (!data || data.length === 0) {
        return 0;
      }

      // Mark messages as auto-deleted
      const messageIds = data.map((m) => m.id);

      const { error: updateError } = await supabaseAdmin!
        .from("messages")
        .update({
          is_message_auto_deleted: true,
          // Keep auto_delete_at for record-keeping
        })
        .in("id", messageIds);

      if (updateError) {
        throw new AppError(
          `Failed to mark messages as auto-deleted: ${updateError.message}`,
          400
        );
      }

      // Emit message deleted events
      data.forEach((message) => {
        SocketService.emitMessageDeleted(message.chat_id, message.id);
      });

      return data.length;
    },
    "Failed to process auto-delete messages"
  );
}
