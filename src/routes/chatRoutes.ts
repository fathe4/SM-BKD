// src/routes/chatRoutes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { ChatController } from "../controllers/chatController";

const router = Router();

// Apply authentication to all chat routes
router.use(authenticate);

/**
 * @route GET /api/v1/chats
 * @desc Get all chats for the current user
 * @access Private
 */
router.get("/", ChatController.getUserChats);

/**
 * @route POST /api/v1/chats
 * @desc Create a new chat
 * @access Private
 */
router.post("/", ChatController.createChat);

/**
 * @route GET /api/v1/chats/:id
 * @desc Get a chat by ID
 * @access Private
 */
router.get("/:id", ChatController.getChatById);

/**
 * @route GET /api/v1/chats/:id/messages
 * @desc Get messages for a chat
 * @access Private
 */
router.get("/:id/messages", ChatController.getChatMessages);

/**
 * @route POST /api/v1/chats/:id/messages
 * @desc Send a message in a chat
 * @access Private
 */
router.post("/:id/messages", ChatController.sendMessage);

/**
 * @route DELETE /api/v1/chats/:id/messages/:messageId
 * @desc Delete a message
 * @access Private
 */
router.delete("/:id/messages/:messageId", ChatController.deleteMessage);

/**
 * @route POST /api/v1/chats/:id/messages/:messageId/read
 * @desc Mark a message as read
 * @access Private
 */
router.post("/:id/messages/:messageId/read", ChatController.markMessageAsRead);

export default router;
