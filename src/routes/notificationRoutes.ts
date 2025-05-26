// src/routes/notificationRoutes.ts
import { Router } from "express";
import { NotificationController } from "../controllers/notificationController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/notifications
 * @desc Get all notifications for the current user
 * @access Private
 */
router.get("/", NotificationController.getNotifications);

/**
 * @route GET /api/v1/notifications/unread-count
 * @desc Get unread notification count for the current user
 * @access Private
 */
router.get("/unread-count", NotificationController.getUnreadCount);

/**
 * @route PATCH /api/v1/notifications/:notificationId/read
 * @desc Mark a specific notification as read
 * @access Private
 */
router.patch("/:notificationId/read", NotificationController.markAsRead);

/**
 * @route PATCH /api/v1/notifications/read-all
 * @desc Mark all notifications as read for the current user
 * @access Private
 */
router.patch("/read-all", NotificationController.markAllAsRead);

/**
 * @route DELETE /api/v1/notifications/:notificationId
 * @desc Delete a specific notification
 * @access Private
 */
router.delete("/:notificationId", NotificationController.deleteNotification);

/**
 * @route DELETE /api/v1/notifications
 * @desc Delete all notifications for the current user
 * @access Private
 */
router.delete("/", NotificationController.deleteAllNotifications);

export default router;
