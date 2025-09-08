// src/controllers/notificationController.ts
import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { NotificationService } from "../services/notificationService";
import { UUID } from "crypto";

export class NotificationController {
  /**
   * Get all notifications for the current user
   * @route GET /api/v1/notifications
   */
  static getNotifications = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const { notifications, total } =
        await NotificationService.getUserNotifications(userId, page, limit);

      res.status(200).json({
        status: "success",
        data: {
          notifications,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    },
  );

  /**
   * Mark a specific notification as read
   * @route PATCH /api/v1/notifications/:notificationId/read
   */
  static markAsRead = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const notificationId = req.params.notificationId as UUID;

    const notification = await NotificationService.markAsRead(
      notificationId,
      userId,
    );

    res.status(200).json({
      status: "success",
      data: {
        notification,
      },
    });
  });

  /**
   * Mark all notifications as read for the current user
   * @route PATCH /api/v1/notifications/read-all
   */
  static markAllAsRead = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      await NotificationService.markAllAsRead(userId);

      res.status(200).json({
        status: "success",
        message: "All notifications marked as read",
      });
    },
  );

  /**
   * Get unread notification count for the current user
   * @route GET /api/v1/notifications/unread-count
   */
  static getUnreadCount = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      const count = await NotificationService.getUnreadCount(userId);

      res.status(200).json({
        status: "success",
        data: {
          count,
        },
      });
    },
  );

  /**
   * Delete a specific notification
   * @route DELETE /api/v1/notifications/:notificationId
   */
  static deleteNotification = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const notificationId = req.params.notificationId as UUID;

      await NotificationService.deleteNotification(notificationId, userId);

      res.status(204).send();
    },
  );

  /**
   * Delete all notifications for the current user
   * @route DELETE /api/v1/notifications
   */
  static deleteAllNotifications = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      await NotificationService.deleteAllNotifications(userId);

      res.status(204).send();
    },
  );
}
