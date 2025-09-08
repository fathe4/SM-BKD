import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { Message } from "../models/messaging.model";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Service for handling message operations
 */
export class MessageService {
  /**
   * Create a new message
   */
  static createMessage = asyncHandler(
    async (messageData: Omit<Message, "updated_at">): Promise<Message> => {
      const { data, error } = await supabaseAdmin!
        .from("messages")
        .insert(messageData)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Message;
    },
    "Failed to create message",
  );

  /**
   * Get a message by ID
   */
  static getMessageById = asyncHandler(
    async (messageId: string): Promise<Message | null> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new AppError(error.message, 400);
      }

      return data as Message;
    },
    "Failed to get message",
  );

  /**
   * Update a message
   */
  static updateMessage = asyncHandler(
    async (
      messageId: string,
      updateData: Partial<
        Omit<Message, "id" | "chat_id" | "sender_id" | "created_at">
      >,
    ): Promise<Message> => {
      const { data, error } = await supabaseAdmin!
        .from("messages")
        .update(updateData)
        .eq("id", messageId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Message;
    },
    "Failed to update message",
  );

  /**
   * Delete a message (soft delete)
   */
  static deleteMessage = asyncHandler(
    async (messageId: string): Promise<void> => {
      const { error } = await supabaseAdmin!
        .from("messages")
        .update({
          is_deleted: true,
          content: "[This message was deleted]",
          media: [],
        })
        .eq("id", messageId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete message",
  );

  /**
   * Mark a message as read
   */
  static markMessageAsRead = asyncHandler(
    async (messageId: string, userId: string): Promise<void> => {
      // First update the specific message if the user is in the chat
      const { error: messageError } = await supabaseAdmin!
        .from("messages")
        .update({ is_read: true })
        .eq("id", messageId);

      if (messageError) {
        throw new AppError(messageError.message, 400);
      }

      // Then update the chat_participants table with the last read timestamp
      const message = await this.getMessageById(messageId);

      if (message) {
        const { error: participantError } = await supabaseAdmin!
          .from("chat_participants")
          .update({
            last_read: new Date().toISOString(),
          })
          .eq("chat_id", message.chat_id)
          .eq("user_id", userId);

        if (participantError) {
          throw new AppError(participantError.message, 400);
        }
      }
    },
    "Failed to mark message as read",
  );

  /**
   * Get messages for a chat with pagination
   */
  static getChatMessages = asyncHandler(
    async (
      chatId: string,
      page = 1,
      limit = 50,
    ): Promise<{ messages: Message[]; total: number }> => {
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("messages")
        .select("*", { count: "exact" })
        .eq("chat_id", chatId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        messages: data as Message[],
        total: count || 0,
      };
    },
    "Failed to get chat messages",
  );

  /**
   * Get participants of a chat
   */
  static getChatParticipants = asyncHandler(
    async (
      chatId: string,
    ): Promise<Array<{ id: string; username: string }>> => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select(
          `
          user_id,
          users!inner (
            id, 
            username
          )
        `,
        )
        .eq("chat_id", chatId);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data.map((item: any) => ({
        id: item.user_id,
        username: item.users.username,
      }));
    },
    "Failed to get chat participants",
  );

  /**
   * Handle message retention
   * Delete messages based on retention policy
   */
  static cleanupExpiredMessages = asyncHandler(async (): Promise<number> => {
    const now = new Date().toISOString();

    // Delete messages that have reached their auto_delete_at time
    const { data, error } = await supabaseAdmin!
      .from("messages")
      .update({
        is_deleted: true,
        content: "[This message has expired]",
        media: [],
      })
      .lt("auto_delete_at", now)
      .eq("is_deleted", false);

    if (error) {
      throw new AppError(error.message, 400);
    }

    return data ? (data as any[]).length : 0;
  }, "Failed to cleanup expired messages");

  /**
   * Clean up read messages with "after_read" retention policy
   */
  static cleanupReadMessages = asyncHandler(async (): Promise<number> => {
    // This would require a more complex query or multiple queries to implement
    // For now, we'll use a simplified version
    const { data, error } = await supabaseAdmin!
      .from("messages")
      .update({
        is_deleted: true,
        content: "[This message has expired after being read]",
        media: [],
      })
      .eq("is_read", true)
      .eq("is_deleted", false)
      .eq("auto_delete_at", null); // For messages with AFTER_READ policy

    if (error) {
      throw new AppError(error.message, 400);
    }

    return data ? (data as any[]).length : 0;
  }, "Failed to cleanup read messages");
}

// Export service instance
export const messageService = MessageService;
