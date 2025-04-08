import { Router } from "express";
import { ChatController } from "../controllers/chatController";
import { authenticate } from "../middlewares/authenticate";
import {
  validateCreateChat,
  validateUpdateChat,
  validateAddParticipants,
} from "../middlewares/validators/chatValidator";
import { MessageController } from "../controllers/messageController";
import { ChatPrivacyMiddleware } from "../middlewares/chatPrivacyMiddleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/v1/chats
 * @desc Create a new chat
 * @access Private
 */
router.post("/", validateCreateChat, ChatController.createChat);

/**
 * @route GET /api/v1/chats
 * @desc Get all chats for the current user
 * @access Private
 */
router.get("/", ChatController.getMyChats);

/**
 * @route GET /api/v1/chats/:chatId
 * @desc Get a specific chat
 * @access Private (chat participants only)
 */
router.get("/:chatId", ChatController.getChat);

/**
 * @route PATCH /api/v1/chats/:chatId
 * @desc Update a chat
 * @access Private (chat admin only)
 */
router.patch("/:chatId", validateUpdateChat, ChatController.updateChat);

/**
 * @route DELETE /api/v1/chats/:chatId
 * @desc Delete a chat
 * @access Private (chat admin only)
 */
router.delete("/:chatId", ChatController.deleteChat);

/**
 * @route POST /api/v1/chats/:chatId/participants
 * @desc Add participants to a chat
 * @access Private (chat admin for group chats, anyone for direct chats)
 */
router.post(
  "/:chatId/participants",
  validateAddParticipants,
  ChatPrivacyMiddleware.canAddParticipants,
  ChatController.addParticipants
);

/**
 * @route DELETE /api/v1/chats/:chatId/participants/:participantId
 * @desc Remove a participant from a chat
 * @access Private (chat admin or self-removal)
 */
router.delete(
  "/:chatId/participants/:participantId",
  ChatController.removeParticipant
);

/**
 * @route DELETE /api/v1/chats/:chatId/leave
 * @desc Leave a chat
 * @access Private (chat participant only)
 */
router.delete("/:chatId/leave", ChatController.leaveChat);

/**
 * @route GET /api/v1/chats/:chatId/messages
 * @desc Get all messages in a chat with pagination
 * @access Private (chat participants only)
 */
router.get("/:chatId/messages", MessageController.getMessages);

export default router;
