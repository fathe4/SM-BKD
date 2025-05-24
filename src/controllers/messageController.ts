// src/controllers/messageController.ts
import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { enhancedMessageService } from "../services/enhancedMessageService";
import { AppError } from "../middlewares/errorHandler";
import { UUID } from "crypto";
import { supabase } from "../config/supabase";

export class MessageController {
  /**
   * Send a new message
   * @route POST /api/v1/messages
   */
  static sendMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { chatId, content, media } = req.body;

      if (!chatId) {
        throw new AppError("Chat ID is required", 400);
      }

      if (!content && (!media || media.length === 0)) {
        throw new AppError("Message cannot be empty", 400);
      }

      // Get the retention policy from the middleware
      const autoDeleteAt = res.locals.messageAutoDeleteAt;

      // Create the message with privacy settings applied
      const message = await enhancedMessageService.createMessage({
        chat_id: chatId as UUID,
        sender_id: userId,
        content,
        media,
      });

      res.status(201).json({
        status: "success",
        data: {
          message,
          expiresAt: autoDeleteAt,
        },
      });
    }
  );

  /**
   * Mark a message as read with privacy-aware read receipts
   * @route POST /api/v1/messages/:messageId/read
   */
  static markMessageAsRead = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { messageId } = req.params;

      // Get read receipt permission from middleware
      const shouldSendReadReceipt = res.locals.sendReadReceipt !== false;

      // Mark the message as read
      const { message, readReceiptSent } =
        await enhancedMessageService.markMessageAsRead(
          messageId,
          userId,
          shouldSendReadReceipt
        );

      res.status(200).json({
        status: "success",
        data: {
          message,
          readReceiptSent,
        },
      });
    }
  );

  /**
   * Get all messages in a chat with pagination
   * @route GET /api/v1/chats/:chatId/messages
   */
  static getMessages = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { chatId } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      // Fetch messages with privacy controls
      const { messages, total } =
        await enhancedMessageService.getMessagesForChat(
          chatId,
          userId,
          page,
          limit
        );

      res.status(200).json({
        status: "success",
        data: {
          messages,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  /**
   * Delete a message
   * @route DELETE /api/v1/messages/:messageId
   */
  static deleteMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { messageId } = req.params;

      await enhancedMessageService.deleteMessage(messageId, userId);

      res.status(204).send();
    }
  );

  /**
   * Forward a message to another chat
   * @route POST /api/v1/messages/:messageId/forward
   */
  static forwardMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { messageId } = req.params;
      const { targetChatId } = req.body;

      if (!targetChatId) {
        throw new AppError("Target chat ID is required", 400);
      }

      // Check if user has permission to forward this message
      const canForward = await enhancedMessageService.canForwardMessage(
        messageId,
        userId
      );

      if (!canForward) {
        throw new AppError(
          "You don't have permission to forward this message",
          403
        );
      }

      // Get the original message
      const { data: originalMessage, error } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (error) {
        throw new AppError("Message not found", 404);
      }

      // Apply retention policy from middleware

      // Create a new message in the target chat with the original content
      const forwardedMessage = await enhancedMessageService.createMessage({
        chat_id: targetChatId as UUID,
        sender_id: userId,
        content: originalMessage.content,
        media: originalMessage.media,
        // Could add metadata about forwarding
        // forwarded_from: originalMessage.sender_id,
        // original_message_id: messageId
      });

      res.status(201).json({
        status: "success",
        data: {
          message: forwardedMessage,
        },
      });
    }
  );
}
