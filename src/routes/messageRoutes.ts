// src/routes/messageRoutes.ts
import { Router } from "express";
import { MessageController } from "../controllers/messageController";
import { authenticate } from "../middlewares/authenticate";
import { MessagePrivacyMiddleware } from "../middlewares/messagePrivacyMiddleware";
import {
  validateCreateMessage,
  validateForwardMessage,
} from "../middlewares/validators/messageValidator";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/v1/messages
 * @desc Send a new message
 * @access Private
 */
router.post(
  "/",
  validateCreateMessage,
  MessagePrivacyMiddleware.canSendMessage,
  MessagePrivacyMiddleware.applyRetentionPolicy,
  MessageController.sendMessage
);

/**
 * @route POST /api/v1/messages/:messageId/read
 * @desc Mark a message as read
 * @access Private
 */
router.post(
  "/:messageId/read",
  MessagePrivacyMiddleware.checkReadReceiptPermission,
  MessageController.markMessageAsRead
);

/**
 * @route DELETE /api/v1/messages/:messageId
 * @desc Delete a message
 * @access Private (message sender only)
 */
router.delete("/:messageId", MessageController.deleteMessage);

/**
 * @route POST /api/v1/messages/:messageId/forward
 * @desc Forward a message to another chat
 * @access Private (requires permission)
 */
router.post(
  "/:messageId/forward",
  validateForwardMessage,
  MessagePrivacyMiddleware.canForwardMessage,
  MessagePrivacyMiddleware.applyRetentionPolicy, // Apply retention policy for the forwarded message
  MessageController.forwardMessage
);

/**
 * Chat-specific message routes
 */

/**
 * @route GET /api/v1/chats/:chatId/messages
 * @desc Get all messages in a chat with pagination
 * @access Private (chat participants only)
 */
router.get("/chats/:chatId/messages", MessageController.getMessages);

export default router;
