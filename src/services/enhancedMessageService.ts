/* eslint-disable indent */
// src/services/enhancedMessageService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { Message } from "../models/messaging.model";
import { asyncHandler } from "../utils/asyncHandler";
import { UUID } from "crypto";
import { logger } from "../utils/logger";
import { MessageRetentionPeriod } from "../models/privacy-settings.model";
import { PrivacySettingsService } from "./privacySettingsService";

/**
 * Enhanced message service with privacy features
 */
export class EnhancedMessageService {
  /**
   * Create a new message with privacy settings applied
   */
  static createMessage = asyncHandler(
    async (
      messageData: Omit<
        Message,
        "id" | "created_at" | "is_read" | "is_deleted" | "auto_delete_at"
      >,
    ): Promise<Message> => {
      // Calculate auto_delete_at based on retention policy
      const userSettings = await PrivacySettingsService.getUserPrivacySettings(
        messageData.sender_id,
      );

      const retentionPeriod =
        userSettings.settings.messageSettings?.messageRetentionPeriod ||
        MessageRetentionPeriod.FOREVER;

      const autoDeleteAt = this.calculateAutoDeleteTime(retentionPeriod);

      // Create message with auto_delete_at
      const { data, error } = await supabaseAdmin!
        .from("messages")
        .insert({
          ...messageData,
          is_read: false,
          is_deleted: false,
          auto_delete_at: autoDeleteAt,
          retention_policy: retentionPeriod,
          created_at: new Date(),
        })
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
   * Mark a message as read with privacy-aware read receipts
   */
  static markMessageAsRead = asyncHandler(
    async (
      messageId: string,
      userId: string,
      shouldSendReadReceipt: boolean = true,
    ): Promise<{ message: Message; readReceiptSent: boolean }> => {
      // First update the message
      const { data, error } = await supabaseAdmin!
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", messageId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      const message = data as Message;

      // Update the user's last read timestamp in the chat
      const { error: participantError } = await supabaseAdmin!
        .from("chat_participants")
        .update({
          last_read: new Date().toISOString(),
        })
        .eq("chat_id", message.chat_id)
        .eq("user_id", userId);

      if (participantError) {
        logger.warn(
          `Error updating last_read for user ${userId}:`,
          participantError,
        );
      }

      // Handle read receipts based on privacy settings
      let readReceiptSent = false;

      if (shouldSendReadReceipt) {
        // Check both users' privacy settings for read receipts
        const [userSettings, senderSettings] = await Promise.all([
          PrivacySettingsService.getUserPrivacySettings(userId as UUID),
          PrivacySettingsService.getUserPrivacySettings(
            message.sender_id as UUID,
          ),
        ]);

        const userAllowsReadReceipts =
          userSettings.settings.messageSettings?.allowMessageReadReceipts ??
          true;
        const senderAllowsReadReceipts =
          senderSettings.settings.messageSettings?.allowMessageReadReceipts ??
          true;

        readReceiptSent = userAllowsReadReceipts && senderAllowsReadReceipts;
      }

      // After read retention policy handling
      await this.handleAfterReadRetention(message);

      return { message, readReceiptSent };
    },
    "Failed to mark message as read",
  );

  /**
   * Delete a message (soft delete) with privacy controls
   */
  static deleteMessage = asyncHandler(
    async (messageId: string, userId: string): Promise<void> => {
      // First check if the user has permission to delete this message
      const { data: message, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          throw new AppError("Message not found", 404);
        }
        throw new AppError(fetchError.message, 400);
      }

      // Check if user is the sender or has special permissions
      if (message.sender_id !== userId) {
        // Could check if user is chat admin or has moderation powers
        throw new AppError("You can only delete your own messages", 403);
      }

      // Perform soft delete
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
   * Get messages respecting privacy settings
   */
  static getMessagesForChat = asyncHandler(
    async (
      chatId: string,
      userId: string,
      page = 1,
      limit = 50,
    ): Promise<{ messages: Message[]; total: number }> => {
      // First check if user is a participant in this chat
      const chatParticipants = await this.getChatParticipants(chatId);
      const isParticipant = chatParticipants.some((p) => p.id === userId);

      if (!isParticipant) {
        throw new AppError("You are not a participant in this chat", 403);
      }

      const offset = (page - 1) * limit;

      // Get messages with pagination, sorted by creation time
      const { data, error, count } = await supabase
        .from("messages")
        .select(
          `
            *,
            sender:users!sender_id(
            id,
            username,
            first_name, 
            last_name,
            profile_picture
            )
        `,
          { count: "exact" },
        )
        .eq("chat_id", chatId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      // Mark unread messages as read if they're from other users
      const unreadMessages = (data as Message[]).filter(
        (msg) => !msg.is_read && msg.sender_id !== userId,
      );

      const modifiedData = data.map((message) => ({
        ...message,
        is_read: false,
      }));

      console.log(data, "modifiedData");

      // Process read statuses in the background (non-blocking)
      if (unreadMessages.length > 0) {
        this.processUnreadMessages(unreadMessages, userId).catch((err) => {
          logger.error("Error processing unread messages:", err);
        });
      }

      return {
        messages: modifiedData as Message[],
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
   * Check if a user can forward a message
   */
  static canForwardMessage = asyncHandler(
    async (messageId: string, userId: string): Promise<boolean> => {
      // Get the message
      const { data: message, error } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new AppError("Message not found", 404);
        }
        throw new AppError(error.message, 400);
      }

      // Check if user is part of the conversation
      const chatParticipants = await this.getChatParticipants(message.chat_id);
      const isParticipant = chatParticipants.some((p) => p.id === userId);

      if (!isParticipant && message.sender_id !== userId) {
        return false;
      }

      // Check original sender's privacy settings
      const senderSettings =
        await PrivacySettingsService.getUserPrivacySettings(
          message.sender_id as UUID,
        );
      return senderSettings.settings.messageSettings?.allowForwarding ?? true;
    },
    "Failed to check message forwarding permission",
  );

  /**
   * Calculate auto-delete time based on retention policy
   */
  private static calculateAutoDeleteTime(
    retentionPeriod: MessageRetentionPeriod,
  ): Date | undefined {
    const now = new Date();

    switch (retentionPeriod) {
      case MessageRetentionPeriod.ONE_DAY:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case MessageRetentionPeriod.ONE_WEEK:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case MessageRetentionPeriod.ONE_MONTH:
        return new Date(now.setMonth(now.getMonth() + 1));
      case MessageRetentionPeriod.THREE_MONTHS:
        return new Date(now.setMonth(now.getMonth() + 3));
      case MessageRetentionPeriod.SIX_MONTHS:
        return new Date(now.setMonth(now.getMonth() + 6));
      case MessageRetentionPeriod.ONE_YEAR:
        return new Date(now.setFullYear(now.getFullYear() + 1));
      case MessageRetentionPeriod.AFTER_READ:
        // Special handling - will be handled by the retention job after being read
        return undefined;
      case MessageRetentionPeriod.FOREVER:
      default:
        return undefined;
    }
  }

  /**
   * Process messages that have the AFTER_READ retention policy
   */
  private static async handleAfterReadRetention(
    message: Message,
  ): Promise<void> {
    try {
      // Check if the message should be deleted after reading
      const senderSettings =
        await PrivacySettingsService.getUserPrivacySettings(
          message.sender_id as UUID,
        );
      const retentionPolicy =
        senderSettings.settings.messageSettings?.messageRetentionPeriod;

      if (retentionPolicy === MessageRetentionPeriod.AFTER_READ) {
        console.log(retentionPolicy, "retentionPolicy");

        // Immediately delete the message
        await supabaseAdmin!
          .from("messages")
          .update({
            is_message_auto_deleted: true,
            content:
              "[This message was automatically deleted after being read]",
            media: [],
          })
          .eq("id", message.id);
      }
    } catch (error) {
      logger.error(
        `Error handling after-read retention for message ${message.id}:`,
        error,
      );
    }
  }

  /**
   * Process unread messages in bulk
   * This is done in the background to avoid blocking the response
   */
  private static async processUnreadMessages(
    messages: Message[],
    userId: string,
  ): Promise<void> {
    try {
      // Get privacy settings for read receipts
      const userSettings = await PrivacySettingsService.getUserPrivacySettings(
        userId as UUID,
      );
      const userAllowsReadReceipts =
        userSettings.settings.messageSettings?.allowMessageReadReceipts ?? true;

      if (!userAllowsReadReceipts) {
        // Just mark as read without sending receipts
        const messageIds = messages.map((msg) => msg.id);
        await supabaseAdmin!
          .from("messages")
          .update({ is_read: true })
          .in("id", messageIds);
        return;
      }

      // Group messages by sender
      const messagesBySender: Record<string, Message[]> = {};
      messages.forEach((msg) => {
        if (!messagesBySender[msg.sender_id]) {
          messagesBySender[msg.sender_id] = [];
        }
        messagesBySender[msg.sender_id].push(msg);
      });

      // Process each sender's messages
      for (const [senderId, senderMessages] of Object.entries(
        messagesBySender,
      )) {
        // Check sender's read receipt preference
        const senderSettings =
          await PrivacySettingsService.getUserPrivacySettings(senderId as UUID);
        // const senderAllowsReadReceipts =
        //   senderSettings.settings.messageSettings?.allowMessageReadReceipts ??
        //   true;

        const messageIds = senderMessages.map((msg) => msg.id);

        // Update messages as read
        await supabaseAdmin!
          .from("messages")
          .update({ is_read: true })
          .in("id", messageIds);

        // Handle special AFTER_READ retention policy
        if (
          senderSettings.settings.messageSettings?.messageRetentionPeriod ===
          MessageRetentionPeriod.AFTER_READ
        ) {
          await supabaseAdmin!
            .from("messages")
            .update({
              is_deleted: true,
              content:
                "[This message was automatically deleted after being read]",
              media: [],
            })
            .in("id", messageIds);
        }
      }

      // Update last_read in chat_participants
      if (messages.length > 0) {
        const chatId = messages[0].chat_id;
        await supabaseAdmin!
          .from("chat_participants")
          .update({
            last_read: new Date().toISOString(),
          })
          .eq("chat_id", chatId)
          .eq("user_id", userId);
      }
    } catch (error) {
      logger.error("Error processing unread messages:", error);
    }
  }
}

// Export service instance
export const enhancedMessageService = EnhancedMessageService;
