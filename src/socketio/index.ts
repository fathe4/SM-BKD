import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { connectionHandler } from "./handlers/connectionHandler";
import { roomHandler } from "./handlers/roomHandler";
import { messageHandler } from "./handlers/messageHandler"; // Import message handler if not already imported
import { chatHandler } from "./handlers/chatHandler"; // Import the new chat handler
import { socketAuthMiddleware } from "./middleware/authenticate";
import { rateLimiterMiddleware } from "./middleware/rateLimiter";
import { readReceiptHandler } from "./handlers/readReceiptHandler";
import { SocketChatPrivacyMiddleware } from "./middleware/chatPrivacyMiddleware";

// Socket.IO server instance
let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server with the Express HTTP server
 */
export function initializeSocketIO(httpServer: HttpServer): SocketIOServer {
  if (io) {
    return io; // Return existing instance if already initialized
  }

  // Create Socket.IO server with security settings
  io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    // Enhanced socket security
    connectTimeout: 10000,
    maxHttpBufferSize: 1e6, // 1MB max message size
    allowRequest: (req, callback) => {
      // Additional request validation could go here
      // Always allow in this implementation but could add IP checks, etc.
      callback(null, true);
    },
  });

  const socketServer = io;

  // Apply global middleware
  socketServer.use(socketAuthMiddleware);
  socketServer.use(rateLimiterMiddleware);
  socketServer.use(SocketChatPrivacyMiddleware.canAddParticipantsMiddleware);

  // Set up connection event
  socketServer.on("connection", (socket: Socket) => {
    logger.info(`New socket connection: ${socket.id}`);

    // Apply connection handler
    connectionHandler(socketServer, socket);

    // Apply room handler
    roomHandler(socketServer, socket);

    // Apply message handler (if not already added)
    messageHandler(socketServer, socket);
    readReceiptHandler(socketServer, socket);

    // Apply the new chat handler
    chatHandler(socketServer, socket);
  });

  logger.info("Socket.IO server initialized");
  return socketServer;
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized. Call initializeSocketIO first.",
    );
  }
  return io;
}
