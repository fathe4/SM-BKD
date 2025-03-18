import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "dotenv";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/logger";

// Load environment variables
config();

// Create Express application
const app: Application = express();
const port = process.env.PORT || 5000;
const apiPrefix = process.env.API_PREFIX || "/api/v1";

// Apply middlewares
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
app.use(morgan("dev")); // Request logging

// Health check route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes will be imported and used here
// app.use(apiPrefix, authRoutes);
// app.use(apiPrefix, userRoutes);
// ...etc

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
      `Server running on port ${port} in ${process.env.NODE_ENV} mode`
    );
    logger.info(`API accessible at http://localhost:${port}${apiPrefix}`);
  });
}

export default app;
