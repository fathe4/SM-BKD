import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { connectionHandler } from "./handlers/connectionHandler";
import { roomHandler } from "./handlers/roomHandler";
import { socketAuthMiddleware } from "./middleware/authenticate";
import { rateLimiterMiddleware } from "./middleware/rateLimiter";

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

  // Set up connection event
  socketServer.on("connection", (socket: Socket) => {
    logger.info(`New socket connection: ${socket.id}`);

    // Apply connection handler
    connectionHandler(socketServer, socket);

    // Apply room handler
    roomHandler(socketServer, socket);
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
      "Socket.IO has not been initialized. Call initializeSocketIO first."
    );
  }
  return io;
}
