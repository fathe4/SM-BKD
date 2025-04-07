/* eslint-disable indent */
// src/services/chatService.ts
import { supabase, supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { AppError } from "../../middlewares/errorHandler";
import { asyncHandler } from "../../utils/asyncHandler";
import { SocketMessage } from "../../types/socket";
import { UUID } from "crypto";
import { MemberRole } from "../../models/group-page.model";
import schedule from "node-schedule";
import { getOnlineUsers } from "@/config/socketio";

// Map to store scheduled deletion jobs
const scheduledDeletions = new Map<string, schedule.Job>();

/**
 * Service for chat-related operations
 */
export class ChatService {
  /**
   * Create a new chat (1-1 or group)
   */
  static createChat = asyncHandler(
    async (
      creatorId: UUID,
      participantIds: UUID[],
      isGroupChat: boolean = false,
      chatName?: string
    ) => {
      // Verify all participants exist
      const allParticipants = [...new Set([creatorId, ...participantIds])];

      // For 1-1 chats, check if chat already exists
      if (!isGroupChat && participantIds.length === 1) {
        const existingChat = await this.findDirectChat(
          creatorId,
          participantIds[0]
        );
        if (existingChat) {
          return existingChat;
        }
      }

      // Create chat
      const { data: chat, error: chatError } = await supabaseAdmin!
        .from("chats")
        .insert({
          is_group_chat: isGroupChat,
          name: chatName,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (chatError) {
        throw new AppError(`Failed to create chat: ${chatError.message}`, 400);
      }

      // Add all participants
      const participantsData = allParticipants.map((userId) => ({
        chat_id: chat.id,
        user_id: userId,
        role: userId === creatorId ? MemberRole.ADMIN : MemberRole.MEMBER,
        joined_at: new Date().toISOString(),
      }));

      const { error: participantsError } = await supabaseAdmin!
        .from("chat_participants")
        .insert(participantsData);

      if (participantsError) {
        throw new AppError(
          `Failed to add chat participants: ${participantsError.message}`,
          400
        );
      }

      return chat;
    },
    "Failed to create chat"
  );

  /**
   * Find a direct chat between two users
   */
  static findDirectChat = asyncHandler(async (userId1: UUID, userId2: UUID) => {
    // Find chats where both users are participants
    const { data, error } = await supabase
      .from("chats")
      .select("*, chat_participants!inner(*)")
      .eq("is_group_chat", false)
      .filter("chat_participants.user_id", "in", `(${userId1},${userId2})`)
      .limit(10); // Set a reasonable limit

    if (error) {
      throw new AppError(`Failed to find direct chat: ${error.message}`, 400);
    }

    // Check each chat to find one with exactly these two participants
    for (const chat of data || []) {
      const participants = chat.chat_participants || [];
      const participantIds = new Set(participants.map((p: any) => p.user_id));

      // Chat must have exactly two participants
      if (
        participantIds.size === 2 &&
        participantIds.has(userId1) &&
        participantIds.has(userId2)
      ) {
        return chat;
      }
    }

    return null;
  }, "Failed to find direct chat");

  /**
   * Get chat by ID with participants
   */
  static getChatById = asyncHandler(async (chatId: UUID, userId: UUID) => {
    // Check if user is a participant
    const { data: participant, error: participantError } = await supabase
      .from("chat_participants")
      .select("*")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (participantError) {
      throw new AppError(
        `Failed to check chat participant: ${participantError.message}`,
        400
      );
    }

    if (!participant) {
      throw new AppError("You are not a participant in this chat", 403);
    }

    // Get chat with all participants
    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select(
        `
          *,
          chat_participants(
            id,
            user_id,
            role,
            joined_at,
            last_read,
            users:user_id(
              id,
              username,
              first_name,
              last_name,
              profile_picture,
              is_verified
            )
          )
        `
      )
      .eq("id", chatId)
      .single();

    if (chatError) {
      throw new AppError(`Failed to get chat: ${chatError.message}`, 400);
    }

    return chat;
  }, "Failed to get chat");

  /**
   * Get all chats for a user
   */
  static getUserChats = asyncHandler(
    async (userId: UUID, limit = 20, offset = 0) => {
      // Get all chats where user is a participant
      const { data, error, count } = await supabase
        .from("chat_participants")
        .select(
          `
          chat:chat_id(
            id,
            created_at,
            is_group_chat,
            name,
            chat_participants(
              user_id,
              role,
              last_read,
              users:user_id(
                id,
                username,
                first_name,
                last_name,
                profile_picture,
                is_verified
              )
            ),
            messages:messages(
              id,
              sender_id,
              content,
              media,
              created_at,
              is_read
            )
          )
        `,
          { count: "exact" }
        )
        .eq("user_id", userId)
        .order("joined_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(`Failed to get user chats: ${error.message}`, 400);
      }

      // Process and format the chats
      const chats = data
        .map((item) => {
          // In Supabase's nested queries, the chat property is an array with one element
          const chatData = Array.isArray(item.chat) ? item.chat[0] : item.chat;

          if (!chatData) {
            return null; // Skip if chat data is not available
          }

          // Get latest message
          const messages = Array.isArray(chatData.messages)
            ? chatData.messages
            : [];
          messages.sort(
            (a: any, b: any) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          const latestMessage = messages.length > 0 ? messages[0] : null;

          // Count unread messages
          const unreadCount = messages.filter(
            (msg: any) => msg.sender_id !== userId && !msg.is_read
          ).length;

          // Format chat data
          return {
            id: chatData.id,
            // For 1:1 chats, use the other participant's name
            name: chatData.is_group_chat
              ? chatData.name
              : getOtherParticipantName(chatData.chat_participants, userId),
            is_group_chat: chatData.is_group_chat,
            created_at: chatData.created_at,
            participants: Array.isArray(chatData.chat_participants)
              ? chatData.chat_participants
              : [],
            latest_message: latestMessage,
            unread_count: unreadCount,
          };
        })
        .filter(Boolean); // Remove null entries

      return {
        chats,
        total: count || 0,
      };
    },
    "Failed to get user chats"
  );

  /**
   * Send a message
   */
  static sendMessage = asyncHandler(async (messageData: SocketMessage) => {
    // Check if sender is a participant
    const { data: participant, error: participantError } = await supabase
      .from("chat_participants")
      .select("*")
      .eq("chat_id", messageData.chat_id)
      .eq("user_id", messageData.sender_id)
      .maybeSingle();

    if (participantError) {
      throw new AppError(
        `Failed to check chat participant: ${participantError.message}`,
        400
      );
    }

    if (!participant) {
      throw new AppError("You are not a participant in this chat", 403);
    }

    // Format message data
    const message = {
      chat_id: messageData.chat_id,
      sender_id: messageData.sender_id,
      content: messageData.content,
      media: messageData.media
        ? messageData.media.map((m) => ({
            url: m.url,
            type: m.type,
            name: m.name,
            size: m.size,
          }))
        : null,
      is_read: false,
      auto_delete_at: messageData.auto_delete_at,
      created_at: new Date().toISOString(),
      is_deleted: false,
    };

    // Insert message
    const { data, error } = await supabaseAdmin!
      .from("messages")
      .insert(message)
      .select(
        `
          *,
          sender:sender_id(
            id,
            username,
            first_name,
            last_name,
            profile_picture
          )
        `
      )
      .single();

    if (error) {
      throw new AppError(`Failed to send message: ${error.message}`, 400);
    }

    // Schedule auto-deletion if needed
    if (message.auto_delete_at) {
      this.scheduleMessageDeletion(data.id, message.auto_delete_at);
    }

    // Update last_read for sender
    await supabaseAdmin!
      .from("chat_participants")
      .update({ last_read: new Date().toISOString() })
      .eq("chat_id", messageData.chat_id)
      .eq("user_id", messageData.sender_id);

    return data;
  }, "Failed to send message");

  /**
   * Get messages for a chat
   */
  static getChatMessages = asyncHandler(
    async (
      chatId: UUID,
      userId: UUID,
      limit = 50,
      beforeTimestamp?: string
    ) => {
      // Check if user is a participant
      const { data: participant, error: participantError } = await supabase
        .from("chat_participants")
        .select("*")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();

      if (participantError) {
        throw new AppError(
          `Failed to check chat participant: ${participantError.message}`,
          400
        );
      }

      if (!participant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      // Build query
      let query = supabase
        .from("messages")
        .select(
          `
          *,
          sender:sender_id(
            id,
            username,
            first_name,
            last_name,
            profile_picture
          )
        `
        )
        .eq("chat_id", chatId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(limit);

      // Add timestamp filter if provided
      if (beforeTimestamp) {
        query = query.lt("created_at", beforeTimestamp);
      }

      // Execute query
      const { data, error } = await query;

      if (error) {
        throw new AppError(
          `Failed to get chat messages: ${error.message}`,
          400
        );
      }

      // Update last_read timestamp
      await supabaseAdmin!
        .from("chat_participants")
        .update({ last_read: new Date().toISOString() })
        .eq("chat_id", chatId)
        .eq("user_id", userId);

      return data;
    },
    "Failed to get chat messages"
  );

  /**
   * Mark message as read
   */
  static markMessageAsRead = asyncHandler(
    async (messageId: UUID, userId: UUID) => {
      // Get the message
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .select("*, chat:chat_id(id)")
        .eq("id", messageId)
        .single();

      if (messageError) {
        throw new AppError(
          `Failed to get message: ${messageError.message}`,
          400
        );
      }

      // Check if user is a participant
      const { data: participant, error: participantError } = await supabase
        .from("chat_participants")
        .select("*")
        .eq("chat_id", message.chat_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (participantError) {
        throw new AppError(
          `Failed to check chat participant: ${participantError.message}`,
          400
        );
      }

      if (!participant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      // Update last_read timestamp
      await supabaseAdmin!
        .from("chat_participants")
        .update({ last_read: new Date().toISOString() })
        .eq("chat_id", message.chat_id)
        .eq("user_id", userId);

      // Mark message as read
      if (message.sender_id !== userId && !message.is_read) {
        const { error: updateError } = await supabaseAdmin!
          .from("messages")
          .update({ is_read: true })
          .eq("id", messageId);

        if (updateError) {
          throw new AppError(
            `Failed to mark message as read: ${updateError.message}`,
            400
          );
        }
      }

      return true;
    },
    "Failed to mark message as read"
  );

  /**
   * Delete a message (by sender)
   */
  static deleteMessage = asyncHandler(async (messageId: UUID, userId: UUID) => {
    // Get the message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (messageError) {
      throw new AppError(`Failed to get message: ${messageError.message}`, 400);
    }

    // Check if user is the sender
    if (message.sender_id !== userId) {
      throw new AppError("You can only delete your own messages", 403);
    }

    // Soft delete by setting is_deleted flag
    const { error: updateError } = await supabaseAdmin!
      .from("messages")
      .update({ is_deleted: true })
      .eq("id", messageId);

    if (updateError) {
      throw new AppError(
        `Failed to delete message: ${updateError.message}`,
        400
      );
    }

    // Cancel scheduled deletion if exists
    if (scheduledDeletions.has(messageId.toString())) {
      const job = scheduledDeletions.get(messageId.toString());
      if (job) {
        job.cancel();
        scheduledDeletions.delete(messageId.toString());
      }
    }

    return true;
  }, "Failed to delete message");

  /**
   * Schedule a message for deletion
   */
  static scheduleMessageDeletion = (
    messageId: UUID,
    deleteTime: string
  ): void => {
    try {
      const deleteDate = new Date(deleteTime);

      // Only schedule if the time is in the future
      if (deleteDate > new Date()) {
        // Cancel any existing job for this message
        if (scheduledDeletions.has(messageId.toString())) {
          const existingJob = scheduledDeletions.get(messageId.toString());
          if (existingJob) {
            existingJob.cancel();
          }
        }

        // Schedule new deletion
        const job = schedule.scheduleJob(deleteDate, async () => {
          try {
            logger.info(`Auto-deleting message: ${messageId}`);

            // Perform deletion
            const { error } = await supabaseAdmin!
              .from("messages")
              .update({ is_deleted: true })
              .eq("id", messageId);

            if (error) {
              logger.error(
                `Failed to auto-delete message ${messageId}: ${error.message}`
              );
            } else {
              logger.info(`Message ${messageId} auto-deleted successfully`);
            }

            // Clean up
            scheduledDeletions.delete(messageId.toString());
          } catch (err) {
            logger.error(`Error in scheduled message deletion: ${err}`);
          }
        });

        // Store the job
        scheduledDeletions.set(messageId.toString(), job);
        logger.info(
          `Scheduled message ${messageId} for deletion at ${deleteDate.toISOString()}`
        );
      }
    } catch (error) {
      logger.error(`Failed to schedule message deletion: ${error}`);
    }
  };

  /**
   * Initialize scheduled message deletions from database
   * Call this when the server starts
   */
  static initializeScheduledDeletions = async (): Promise<void> => {
    try {
      logger.info("Initializing scheduled message deletions...");

      // Get all messages with auto_delete_at in the future
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("messages")
        .select("id, auto_delete_at")
        .gt("auto_delete_at", now)
        .eq("is_deleted", false);

      if (error) {
        logger.error(`Failed to fetch scheduled deletions: ${error.message}`);
        return;
      }

      // Schedule each message for deletion
      for (const message of data) {
        if (message.auto_delete_at) {
          this.scheduleMessageDeletion(message.id, message.auto_delete_at);
        }
      }

      logger.info(`Initialized ${data.length} scheduled message deletions`);
    } catch (error) {
      logger.error(`Error initializing scheduled deletions: ${error}`);
    }
  };

  static scheduleChatDeletion = asyncHandler(
    async (chatId: UUID, userId: UUID, deleteAt: string): Promise<void> => {
      // Check if user is a participant with admin rights
      const { data: participant } = await supabase
        .from("chat_participants")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .single();

      if (!participant || participant.role !== MemberRole.ADMIN) {
        throw new AppError("Only chat admins can schedule deletion", 403);
      }

      // Schedule deletion
      const { error } = await supabaseAdmin!
        .from("chats")
        .update({ auto_delete_at: deleteAt })
        .eq("id", chatId);

      if (error) {
        throw new AppError(
          `Failed to schedule chat deletion: ${error.message}`,
          400
        );
      }

      // Schedule the job
      const deleteDate = new Date(deleteAt);
      schedule.scheduleJob(deleteDate, async () => {
        await supabaseAdmin!
          .from("chats")
          .update({ is_deleted: true })
          .eq("id", chatId);
      });
    },
    "Failed to schedule chat deletion"
  );

  static getOnlineUsers = asyncHandler(async (userId: UUID): Promise<any[]> => {
    // Get user's friends
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted");

    // Extract friend IDs
    const friendIds = (friendships || []).map((f) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );

    // Get online users
    const onlineUsers = getOnlineUsers();

    // Filter to only include friends
    const onlineFriends = onlineUsers.filter(
      (id) => friendIds.includes(id) && userStatus.get(id) !== "invisible"
    );

    // Get user details
    if (onlineFriends.length === 0) return [];

    const { data: users } = await supabase
      .from("users")
      .select("id, username, first_name, last_name, profile_picture")
      .in("id", onlineFriends);

    return (users || []).map((user) => ({
      ...user,
      status: userStatus.get(user.id) || "online",
    }));
  }, "Failed to get online users");
}

function getOtherParticipantName(participants: any[], currentUserId: any) {
  const otherParticipant = participants.find(
    (p: { user_id: any }) => p.user_id !== currentUserId
  );
  if (!otherParticipant || !otherParticipant.users) return "Chat";

  const user = Array.isArray(otherParticipant.users)
    ? otherParticipant.users[0]
    : otherParticipant.users;

  return `${user.first_name} ${user.last_name}`;
}
