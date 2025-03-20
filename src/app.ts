import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "dotenv";
import { errorHandler } from "./middlewares/errorHandler";
import { logger, morganStream } from "./utils/logger";
import authRoutes from "./routes/authRoutes";
import profileRoutes from "./routes/profileRoutes";
import profilePictureRoutes from "./routes/profilePictureRoutes";
import searchRoutes from "./routes/searchRoutes";
import userRoutes from "./routes/userRoutes";

// Load environment variables
config();

// Create Express application
const app: Application = express();
const port = process.env.PORT || 5000;
const apiPrefix = process.env.API_PREFIX || "/api/v1";

// Apply middlewares
app.use(helmet()); // Security headers
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL
      : ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Apply middlewares
app.use(cors(corsOptions)); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
app.use(morgan("dev", { stream: morganStream })); // Request logging

// Health check route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/profiles`, profileRoutes);
app.use(`${apiPrefix}/profile-pictures`, profilePictureRoutes);
app.use(`${apiPrefix}/search`, searchRoutes);
app.use(`${apiPrefix}/users`, userRoutes);

// Other routes will be added here as they are implemented
// app.use(`${apiPrefix}/users`, userRoutes);
// app.use(`${apiPrefix}/posts`, postRoutes);
// etc.

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
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logger.info(
      `Server running on port ${port} in ${
        process.env.NODE_ENV || "development"
      } mode`
    );
    logger.info(`API accessible at http://localhost:${port}${apiPrefix}`);
  });
}

export default app;
