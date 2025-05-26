// src/services/notificationService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import { Notification, NotificationCreate } from "../models/notification.model";
import { getIO } from "../socketio";
import { getUserSocketIds } from "../socketio/handlers/connectionHandler";

export class NotificationService {
  /**
   * Create a new notification
   */
  static createNotification = asyncHandler(
    async (notificationData: NotificationCreate): Promise<Notification> => {
      const { data, error } = await supabaseAdmin!
        .from("notifications")
        .insert({
          ...notificationData,
          is_read: false,
          created_at: new Date(),
        })
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      // Emit socket notification
      const io = getIO();
      const userSocketIds = getUserSocketIds(notificationData.user_id);

      if (userSocketIds.length > 0) {
        userSocketIds.forEach((socketId) => {
          io.to(socketId).emit("notification:new", {
            notification: data,
            message: notificationData.content,
          });
        });
      }

      return data as Notification;
    },
    "Failed to create notification"
  );

  /**
   * Get notifications for a user
   */
  static getUserNotifications = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 20
    ): Promise<{ notifications: Notification[]; total: number }> => {
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from("notifications")
        .select(
          `
          *,
          actor:users!actor_id (
            id,
            username,
            first_name,
            last_name,
            profile_picture
          )
        `,
          { count: "exact" }
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      return {
        notifications: data as unknown as Notification[],
        total: count || 0,
      };
    },
    "Failed to get user notifications"
  );

  /**
   * Mark a notification as read
   */
  static markAsRead = asyncHandler(
    async (notificationId: string, userId: string): Promise<Notification> => {
      const { data, error } = await supabaseAdmin!
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw new AppError(error.message, 400);
      }

      return data as Notification;
    },
    "Failed to mark notification as read"
  );

  /**
   * Mark all notifications as read for a user
   */
  static markAllAsRead = asyncHandler(async (userId: string): Promise<void> => {
    const { error } = await supabaseAdmin!
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      throw new AppError(error.message, 400);
    }
  }, "Failed to mark all notifications as read");

  /**
   * Get unread notification count for a user
   */
  static getUnreadCount = asyncHandler(
    async (userId: string): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      console.log(count, "count");

      if (error) {
        throw new AppError(error.message, 400);
      }

      return count || 0;
    },
    "Failed to get unread notification count"
  );

  /**
   * Delete a specific notification
   */
  static deleteNotification = asyncHandler(
    async (notificationId: string, userId: string): Promise<void> => {
      const { error } = await supabaseAdmin!
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete notification"
  );

  /**
   * Delete all notifications for a user
   */
  static deleteAllNotifications = asyncHandler(
    async (userId: string): Promise<void> => {
      const { error } = await supabaseAdmin!
        .from("notifications")
        .delete()
        .eq("user_id", userId);

      if (error) {
        throw new AppError(error.message, 400);
      }
    },
    "Failed to delete all notifications"
  );
}
