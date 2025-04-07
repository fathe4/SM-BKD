// src/routes/messagingRoutes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { MessagingController } from "../controllers/messagingController";
import { canMessageMiddleware } from "../middlewares/canMessageMiddleware";

const router = Router();

// Apply authentication to all messaging routes
router.use(authenticate);

/**
 * @route POST /api/v1/messages/direct/:recipientId
 * @desc Send a direct message to a user
 * @access Private
 */
router.post(
  "/direct/:recipientId",
  canMessageMiddleware,
  MessagingController.sendDirectMessage
);

/**
 * @route GET /api/v1/messages/chat/:userId
 * @desc Get or create a direct chat with a user
 * @access Private
 */
router.get(
  "/chat/:userId",
  canMessageMiddleware,
  MessagingController.getOrCreateDirectChat
);

export default router;
