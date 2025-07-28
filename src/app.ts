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
import { setupMessageRetentionJob } from "./jobs/messageRetentionJob";

// Load environment variables
config();

// Create Express application
const app: Application = express();
const server = http.createServer(app);

const port = process.env.PORT || 5000;
const socket_port = process.env.socket_port || 7979;
const apiPrefix = process.env.API_PREFIX || "/api/v1";

initializeSocketIO(server);

const corsOptions = {
  origin: [
    "http://localhost:3000",
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
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Initialize the message retention job when server starts
setupMessageRetentionJob();

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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Global error handler
app.use(errorHandler);

// Start server if not in test mode
// if (process.env.NODE_ENV !== "development") {
app.listen(port, () => {
  logger.info(
    `Server running on port ${port} in ${
      process.env.NODE_ENV || "development"
    } mode`
  );
  logger.info(`API accessible at http://localhost:${port}${apiPrefix}`);
});
// }

app.use((req, _res, next) => {
  if (Object.keys(req.headers).length === 0) {
    logger.warn(`⚠️  No headers on ${req.method} ${req.originalUrl}`);
  }
  next();
});

server.listen(socket_port, () => {
  logger.info(
    `Server running on port ${socket_port} in ${
      process.env.NODE_ENV || "development"
    } mode`
  );
  logger.info(`API accessible at http://localhost:${socket_port}${apiPrefix}`);
});

export default app;
