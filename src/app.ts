import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { config } from "dotenv";
import { errorHandler } from "./middlewares/errorHandler";
import { logger, morganStream } from "./utils/logger";
import { initializeSocketIO } from "./socketio";

import authRoutes from "./routes/authRoutes";
import profileRoutes from "./routes/profileRoutes";
import profilePictureRoutes from "./routes/profilePictureRoutes";
import searchRoutes from "./routes/searchRoutes";
import userRoutes from "./routes/userRoutes";
import postRoutes from "./routes/postRoutes";
import commentRoutes from "./routes/commentRoutes";
import standaloneCommentRoutes from "./routes/standaloneCommentRoutes";
import friendshipRoutes from "./routes/friendshipRoutes";
import debugRoutes from "./debug/vercelAuth";
import privacySettingsRoutes from "./routes/privacySettingsRoutes";
import messageRoutes from "./routes/messageRoutes";
import chatRoutes from "./routes/chatRoutes";
import photoRoutes from "./routes/photoRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import marketplaceRoutes from "./routes/marketplaceRoutes";
import storyRoutes from "./routes/story.routes";
import paymentRoutes from "./routes/payment.route";
import subscriptionRoutes from "./routes/subscription.routes";
import transactionRoutes from "./routes/transactionRoutes";
import statsRoutes from "./routes/statsRoutes";
import { setupMessageRetentionJob } from "./jobs/messageRetentionJob";
import { setupSubscriptionStatusJob } from "./jobs/subscriptionStatusJob";
import { redisService } from "./services/redis.service";

// Load environment variables
config();

// Initialize Redis connection
try {
  redisService.initialize();
  logger.info("✅ Redis service initialized successfully");
} catch (error) {
  logger.error("❌ Failed to initialize Redis service:", error);
}

// Create Express application
const app: Application = express();
const server = http.createServer(app);

// Use single port for both HTTP and Socket.IO
const port = process.env.PORT || 5000;
const apiPrefix = process.env.API_PREFIX || "/api/v1";

// Initialize Socket.IO on the same server
initializeSocketIO(server);

const corsOptions = {
  origin: [
    "http://localhost:3000", // Frontend client
    "http://localhost:4200", // Admin dashboard
    "https://dambala.ca",
    // "https://yourdomain.com" // Add your frontend domain
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Apply middlewares
app.use(cors(corsOptions)); // Enable CORS for all routes

// Apply middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

app.use(`${apiPrefix}/payments`, paymentRoutes);
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
app.use(morgan("dev", { stream: morganStream })); // Request logging
app.use("/debug", debugRoutes);

// Health check route
app.get("/health", async (req: Request, res: Response) => {
  try {
    const redisStatus = redisService.isReady();
    const redisStats = await redisService.getStats();

    res.status(200).json({
      status: "success",
      message: "Server is healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      redis: {
        connected: redisStatus,
        stats: redisStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Server health check failed",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Initialize the message retention job when server starts
setupMessageRetentionJob();

// Initialize the subscription status job when server starts
setupSubscriptionStatusJob();

// API routes
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/profiles`, profileRoutes);
app.use(`${apiPrefix}/profile-pictures`, profilePictureRoutes);
app.use(`${apiPrefix}/search`, searchRoutes);
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/posts`, postRoutes);
app.use(`${apiPrefix}/posts`, commentRoutes);
app.use(`${apiPrefix}/comments`, standaloneCommentRoutes);
app.use(`${apiPrefix}/friendships`, friendshipRoutes);
app.use(`${apiPrefix}/privacy-settings`, privacySettingsRoutes);
app.use(`${apiPrefix}/messages`, messageRoutes);
app.use(`${apiPrefix}/chats`, chatRoutes);
app.use(`${apiPrefix}/photos`, photoRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/marketplace`, marketplaceRoutes);
app.use(`${apiPrefix}/stories`, storyRoutes);
app.use(`${apiPrefix}/subscriptions`, subscriptionRoutes);
app.use(`${apiPrefix}/transactions`, transactionRoutes);
app.use(`${apiPrefix}/stats`, statsRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Global error handler
app.use(errorHandler);

// Header logging middleware
app.use((req, _res, next) => {
  if (Object.keys(req.headers).length === 0) {
    logger.warn(`⚠️  No headers on ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Start the server ONLY ONCE - using the HTTP server that has Socket.IO attached
if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    logger.info(
      `🚀 Server running on port ${port} in ${
        process.env.NODE_ENV || "development"
      } mode`
    );
    logger.info(`📡 API accessible at http://localhost:${port}${apiPrefix}`);
    logger.info(
      `🔌 Socket.IO accessible at http://localhost:${port}/socket.io/`
    );
  });
}

export default app;
