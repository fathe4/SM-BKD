import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { ChatService } from "../services/chatService";
import { UUID } from "crypto";
import { MemberRole } from "../models/group-page.model";
import { AppError } from "../middlewares/errorHandler";

export class ChatController {
  /**
   * Create a new chat
   * @route POST /api/v1/chats
   */
  static createChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { is_group_chat, name, description, avatar, participants } = req.body;

    // Create chat data
    const chatData = {
      is_group_chat,
      name: is_group_chat ? name : undefined,
      description,
      avatar,
      creator_id: is_group_chat ? userId : undefined,
    };

    const participantsData = [
      {
        user_id: userId,
        role: is_group_chat ? MemberRole.ADMIN : MemberRole.MEMBER,
        // is_muted: false,
      },
      ...participants.map((participantId: string) => ({
        user_id: participantId,
        role: MemberRole.ADMIN,
        // is_muted: false,
      })),
    ];

    // Create the chat
    const chat = await ChatService.createChat(chatData, participantsData);

    // Get chat summary
    const chatSummary = await ChatService.getChatSummary(chat.id, userId);

    res.status(201).json({
      status: "success",
      data: {
        chat: chatSummary,
      },
    });
  });

  /**
   * Get all chats for current user
   * @route GET /api/v1/chats
   */
  static getMyChats = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const { chats, total } = await ChatService.getUserChats(
      userId,
      page,
      limit
    );

    res.status(200).json({
      status: "success",
      data: {
        chats,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  });

  /**
   * Get a specific chat
   * @route GET /api/v1/chats/:chatId
   */
  static getChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { chatId } = req.params;

    const chatSummary = await ChatService.getChatSummary(chatId, userId);

    res.status(200).json({
      status: "success",
      data: {
        chat: chatSummary,
      },
    });
  });

  /**
   * Update a chat
   * @route PATCH /api/v1/chats/:chatId
   */
  static updateChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { chatId } = req.params;
    const { name, description, avatar } = req.body;

    const chat = await ChatService.updateChat(chatId, userId, {
      name,
      description,
      avatar,
    });

    // Get updated chat summary
    const chatSummary = await ChatService.getChatSummary(chat.id, userId);

    res.status(200).json({
      status: "success",
      data: {
        chat: chatSummary,
      },
    });
  });

  /**
   * Add participants to a chat
   * @route POST /api/v1/chats/:chatId/participants
   */
  static addParticipants = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { chatId } = req.params;
      const { participants } = req.body;

      const participantsData = participants.map((participantId: string) => ({
        user_id: participantId as UUID,
        chat_id: chatId as UUID,
        role: MemberRole.MEMBER,
        is_muted: false,
      }));

      await ChatService.addChatParticipants(chatId, userId, participantsData);

      // Get updated chat summary
      const chatSummary = await ChatService.getChatSummary(chatId, userId);

      res.status(200).json({
        status: "success",
        data: {
          chat: chatSummary,
        },
      });
    }
  );

  /**
   * Remove a participant from a chat
   * @route DELETE /api/v1/chats/:chatId/participants/:participantId
   */
  static removeParticipant = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { chatId, participantId } = req.params;

      await ChatService.removeChatParticipant(chatId, userId, participantId);

      // Get updated chat summary (if the chat still exists and user is still in it)
      try {
        const chatSummary = await ChatService.getChatSummary(chatId, userId);

        res.status(200).json({
          status: "success",
          data: {
            chat: chatSummary,
          },
        });
      } catch (error) {
        // If the user was removed or the chat was deleted
        res.status(200).json({
          status: "success",
          message: "Participant removed successfully",
        });
      }
    }
  );

  /**
   * Leave a chat
   * @route DELETE /api/v1/chats/:chatId/leave
   */
  static leaveChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { chatId } = req.params;

    await ChatService.leaveChat(chatId, userId);

    res.status(200).json({
      status: "success",
      message: "You have left the chat successfully",
    });
  });

  /**
   * Delete a chat
   * @route DELETE /api/v1/chats/:chatId
   */
  static deleteChat = controllerHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id as UUID;
    const { chatId } = req.params;

    await ChatService.deleteChat(chatId, userId);

    res.status(200).json({
      status: "success",
      message: "Chat deleted successfully",
    });
  });

  /**
   * Get chat participants
   * @route GET /api/v1/chats/:chatId/participants
   */
  static getChatParticipants = controllerHandler(
    async (req: Request, res: Response) => {
      const { chatId } = req.params;

      // Pagination parameters
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      if (!chatId) {
        throw new AppError("Chat ID is required", 400);
      }

      const { participants, total } = await ChatService.getChatParticipants(
        chatId,
        {
          page,
          limit,
        }
      );

      res.status(200).json({
        status: "success",
        data: {
          participants,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );
}
