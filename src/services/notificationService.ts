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
    "Failed to create notification",
  );

  /**
   * Get notifications for a user
   */
  static getUserNotifications = asyncHandler(
    async (
      userId: string,
      page = 1,
      limit = 20,
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
          { count: "exact" },
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError(error.message, 400);
      }

      // Enrich notifications with post context (post_id + post_image) for comment/reaction types
      const enriched = await Promise.all(
        (data || []).map(async (notif: any) => {
          try {
            if (notif.reference_type === "comment") {
              // Resolve comment → post_id
              const { data: comment } = await supabase
                .from("comments")
                .select("post_id")
                .eq("id", notif.reference_id)
                .maybeSingle();

              if (comment?.post_id) {
                notif.post_id = comment.post_id;

                // Get first image from post_media
                const { data: media } = await supabase
                  .from("post_media")
                  .select("media_url")
                  .eq("post_id", comment.post_id)
                  .order("order", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                notif.post_image = media?.media_url ?? null;
              }
            } else if (notif.reference_type === "reaction") {
              // Resolve reaction → target_id (post_id when target_type = post)
              const { data: reaction } = await supabase
                .from("reactions")
                .select("target_id, target_type")
                .eq("id", notif.reference_id)
                .maybeSingle();

              if (reaction?.target_type === "post" && reaction?.target_id) {
                notif.post_id = reaction.target_id;

                const { data: media } = await supabase
                  .from("post_media")
                  .select("media_url")
                  .eq("post_id", reaction.target_id)
                  .order("order", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                notif.post_image = media?.media_url ?? null;
              }
            }
          } catch {
            // Enrichment is best-effort; never block the response
          }

          return notif;
        }),
      );

      return {
        notifications: enriched as unknown as Notification[],
        total: count || 0,
      };
    },
    "Failed to get user notifications",
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
    "Failed to mark notification as read",
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
    "Failed to get unread notification count",
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
    "Failed to delete notification",
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
    "Failed to delete all notifications",
  );
}
