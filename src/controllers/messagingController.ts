// src/controllers/messagingController.ts
import { Request, Response } from "express";
import { controllerHandler } from "../utils/controllerHandler";
import { MessagingService } from "../services/message/messagingService";
import { AppError } from "../middlewares/errorHandler";
import { UUID } from "crypto";

export class MessagingController {
  /**
   * Send a direct message to a user
   * @route POST /api/v1/messages/direct/:recipientId
   */
  static sendDirectMessage = controllerHandler(
    async (req: Request, res: Response) => {
      const senderId = req.user!.id as UUID;
      const recipientId = res.locals.recipientId as UUID;
      const { content, media, auto_delete_at } = req.body;

      // Validate message content
      if (!content && (!media || media.length === 0)) {
        throw new AppError(
          "Message must contain either text content or media",
          400
        );
      }

      // Send the message
      const result = await MessagingService.sendDirectMessage(
        senderId,
        recipientId,
        content,
        media,
        auto_delete_at
      );

      res.status(201).json({
        status: "success",
        data: result,
      });
    }
  );

  /**
   * Get or create a direct chat with a user
   * @route GET /api/v1/messages/chat/:userId
   */
  static getOrCreateDirectChat = controllerHandler(
    async (req: Request, res: Response) => {
      const currentUserId = req.user!.id as UUID;
      const otherUserId = res.locals.recipientId as UUID;

      const chat = await MessagingService.getOrCreateDirectChat(
        currentUserId,
        otherUserId
      );

      res.status(200).json({
        status: "success",
        data: {
          chat,
        },
      });
    }
  );
}
