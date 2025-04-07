// src/services/socketService.ts
import { Server as HttpServer } from "http";
import { Server, Socket, Namespace } from "socket.io";
import { socketAuth } from "../middlewares/socketAuth";
import { logger } from "../utils/logger";
import { config } from "dotenv";

config();

// Extended Socket interface with user information
export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    email: string;
    role: string;
    username: string;
  };
}

// Chat event types
export enum ChatEventType {
  JOIN_CHAT = "join_chat",
  LEAVE_CHAT = "leave_chat",
  NEW_MESSAGE = "new_message",
  MESSAGE_RECEIVED = "message_received",
  MESSAGE_DELETED = "message_deleted",
  USER_TYPING = "user_typing",
  USER_STOPPED_TYPING = "user_stopped_typing",
  ERROR = "error",
}

// Notification event types
export enum NotificationEventType {
  NEW_NOTIFICATION = "new_notification",
  NOTIFICATION_READ = "notification_read",
}

/**
 * Socket.IO service for real-time communication
 */
export class SocketService {
  private static io: Server;
  private static chatNamespace: Namespace;
  private static notificationNamespace: Namespace;
  private static activeSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  /**
   * Initialize the Socket.IO server
   */
  public static initialize(httpServer: HttpServer): void {
    logger.info("Initializing Socket.IO server...");

    // Create main Socket.IO server with CORS configuration
    this.io = new Server(httpServer, {
      cors: {
        origin:
          process.env.NODE_ENV === "production"
            ? process.env.FRONTEND_URL
            : ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    // Create chat namespace
    this.chatNamespace = this.io.of("/chat");
    this.chatNamespace.use(socketAuth);
    this.setupChatNamespace();

    // Create notification namespace
    this.notificationNamespace = this.io.of("/notifications");
    this.notificationNamespace.use(socketAuth);
    this.setupNotificationNamespace();

    logger.info("Socket.IO server initialized successfully");
  }

  /**
   * Setup event handlers for the chat namespace
   */
  private static setupChatNamespace(): void {
    this.chatNamespace.on("connection", (socket: Socket) => {
      const authenticatedSocket = socket as AuthenticatedSocket;
      const userId = authenticatedSocket.user.id;
      const socketId = socket.id;

      logger.info(
        `User ${userId} connected to chat namespace with socket ${socketId}`
      );

      // Track active sockets for this user
      if (!this.activeSockets.has(userId)) {
        this.activeSockets.set(userId, new Set());
      }
      this.activeSockets.get(userId)?.add(socketId);

      // Handle joining a chat room
      socket.on(ChatEventType.JOIN_CHAT, (chatId: string) => {
        socket.join(chatId);
        logger.info(`User ${userId} joined chat room ${chatId}`);
      });

      // Handle leaving a chat room
      socket.on(ChatEventType.LEAVE_CHAT, (chatId: string) => {
        socket.leave(chatId);
        logger.info(`User ${userId} left chat room ${chatId}`);
      });

      // Handle new message event
      socket.on(ChatEventType.NEW_MESSAGE, (data) => {
        logger.info(`New message from user ${userId} in chat ${data.chatId}`);
        // Broadcast message to all clients in the room except sender
        socket.to(data.chatId).emit(ChatEventType.MESSAGE_RECEIVED, {
          ...data,
          sender: {
            id: userId,
            username: authenticatedSocket.user.username,
          },
        });
      });

      // Handle typing indicators
      socket.on(ChatEventType.USER_TYPING, (chatId: string) => {
        socket.to(chatId).emit(ChatEventType.USER_TYPING, {
          userId,
          username: authenticatedSocket.user.username,
          chatId,
        });
      });

      socket.on(ChatEventType.USER_STOPPED_TYPING, (chatId: string) => {
        socket.to(chatId).emit(ChatEventType.USER_STOPPED_TYPING, {
          userId,
          username: authenticatedSocket.user.username,
          chatId,
        });
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        logger.info(`User ${userId} disconnected from chat namespace`);

        // Remove this socket from tracking
        this.activeSockets.get(userId)?.delete(socketId);
        if (this.activeSockets.get(userId)?.size === 0) {
          this.activeSockets.delete(userId);
        }
      });
    });
  }

  /**
   * Setup event handlers for the notification namespace
   */
  private static setupNotificationNamespace(): void {
    this.notificationNamespace.on("connection", (socket: Socket) => {
      const authenticatedSocket = socket as AuthenticatedSocket;
      const userId = authenticatedSocket.user.id;

      logger.info(`User ${userId} connected to notification namespace`);

      // Join user's personal notification room
      socket.join(`user:${userId}`);

      // Handle disconnect
      socket.on("disconnect", () => {
        logger.info(`User ${userId} disconnected from notification namespace`);
      });
    });
  }

  /**
   * Emit a new message event to all clients in a chat room
   */
  public static emitNewMessage(chatId: string, message: any): void {
    this.chatNamespace.to(chatId).emit(ChatEventType.MESSAGE_RECEIVED, message);
  }

  /**
   * Emit a message deleted event to all clients in a chat room
   */
  public static emitMessageDeleted(chatId: string, messageId: string): void {
    this.chatNamespace.to(chatId).emit(ChatEventType.MESSAGE_DELETED, {
      chatId,
      messageId,
    });
  }

  /**
   * Send a notification to a specific user
   */
  public static sendNotification(userId: string, notification: any): void {
    this.notificationNamespace
      .to(`user:${userId}`)
      .emit(NotificationEventType.NEW_NOTIFICATION, notification);
  }

  /**
   * Check if a user is online (has active sockets)
   */
  public static isUserOnline(userId: string): boolean {
    return (
      this.activeSockets.has(userId) &&
      (this.activeSockets.get(userId)?.size || 0) > 0
    );
  }

  /**
   * Get the number of active connections for a user
   */
  public static getUserConnectionCount(userId: string): number {
    return this.activeSockets.get(userId)?.size || 0;
  }
}
