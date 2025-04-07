// src/controllers/chatController.ts
import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { ChatService } from "../services/message/chatService";
import { AppError } from "../middlewares/errorHandler";
import { UUID } from "crypto";

export class ChatController {
  /**
   * Get all chats for the current user
   * @route GET /api/v1/chats
   */
  static getUserChats = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const result = await ChatService.getUserChats(userId, limit, offset);

      res.status(200).json({
        status: "success",
        data: result,
      });
    }
  );

  /**
   * Create a new chat
   * @route POST /api/v1/chats
   */
  static createChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { participantIds, isGroupChat = false, chatName } = req.body;

    // Validate participantIds
    if (
      !participantIds ||
      !Array.isArray(participantIds) ||
      participantIds.length === 0
    ) {
      throw new AppError("At least one participant ID is required", 400);
    }

    // If group chat, require a name
    if (isGroupChat && !chatName) {
      throw new AppError("Group chat name is required", 400);
    }

    const chat = await ChatService.createChat(
      userId,
      participantIds.map((id) => id as UUID),
      isGroupChat,
      chatName
    );

    res.status(201).json({
      status: "success",
      data: {
        chat,
      },
    });
  });

  /**
   * Get a chat by ID
   * @route GET /api/v1/chats/:id
   */
  static getChatById = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const chatId = req.params.id as UUID;

      const chat = await ChatService.getChatById(chatId, userId);

      res.status(200).json({
        status: "success",
        data: {
          chat,
        },
      });
    }
  );

  /**
   * Get messages for a chat
   * @route GET /api/v1/chats/:id/messages
   */
  static getChatMessages = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const chatId = req.params.id as UUID;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const before = req.query.before as string;

      const messages = await ChatService.getChatMessages(
        chatId,
        userId,
        limit,
        before
      );

      res.status(200).json({
        status: "success",
        data: {
          messages,
        },
      });
    }
  );

  /**
   * Send a message in a chat
   * @route POST /api/v1/chats/:id/messages
   */
  static sendMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const chatId = req.params.id as UUID;
      const { content, media, auto_delete_at } = req.body;

      // Validate message content
      if (!content && (!media || media.length === 0)) {
        throw new AppError(
          "Message must contain either text content or media",
          400
        );
      }

      const message = await ChatService.sendMessage({
        chat_id: chatId,
        sender_id: userId,
        content,
        media,
        auto_delete_at,
      });

      res.status(201).json({
        status: "success",
        data: {
          message,
        },
      });
    }
  );

  /**
   * Delete a message
   * @route DELETE /api/v1/chats/:id/messages/:messageId
   */
  static deleteMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const messageId = req.params.messageId as UUID;

      await ChatService.deleteMessage(messageId, userId);

      res.status(204).send();
    }
  );

  /**
   * Mark a message as read
   * @route POST /api/v1/chats/:id/messages/:messageId/read
   */
  static markMessageAsRead = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const messageId = req.params.messageId as UUID;

      await ChatService.markMessageAsRead(messageId, userId);

      res.status(200).json({
        status: "success",
        message: "Message marked as read",
      });
    }
  );

  static scheduleChatDeletion = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const chatId = req.params.id as UUID;
      const { deleteAt } = req.body;

      if (!deleteAt) {
        throw new AppError("Deletion time is required", 400);
      }

      await ChatService.scheduleChatDeletion(chatId, userId, deleteAt);

      res.status(200).json({
        status: "success",
        message: "Chat scheduled for deletion",
      });
    }
  );
  static getOnlineUsers = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      const onlineUsers = await ChatService.getOnlineUsers(userId);

      res.status(200).json({
        status: "success",
        data: {
          users: onlineUsers,
        },
      });
    }
  );
}
