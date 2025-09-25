import { Request, Response } from "express";
import { StatsService } from "../services/statsService";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";

export class StatsController {
  /**
   * Get comprehensive user statistics
   * @route GET /api/v1/stats/user/:userId
   */
  static async getUserStats(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      logger.info(`Fetching comprehensive stats for user: ${userId}`);

      const stats = await StatsService.getUserStats(userId);

      res.status(200).json({
        success: true,
        message: "User statistics retrieved successfully",
        data: stats
      });
    } catch (error) {
      logger.error("Error in getUserStats:", error);
      
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  /**
   * Get quick user statistics (lightweight)
   * @route GET /api/v1/stats/user/:userId/quick
   */
  static async getQuickStats(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      logger.info(`Fetching quick stats for user: ${userId}`);

      const stats = await StatsService.getQuickStats(userId);

      res.status(200).json({
        success: true,
        message: "Quick statistics retrieved successfully",
        data: stats
      });
    } catch (error) {
      logger.error("Error in getQuickStats:", error);
      
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  /**
   * Get current user's statistics (from JWT token)
   * @route GET /api/v1/stats/me
   */
  static async getMyStats(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      logger.info(`Fetching stats for current user: ${userId}`);

      const stats = await StatsService.getUserStats(userId);

      res.status(200).json({
        success: true,
        message: "Your statistics retrieved successfully",
        data: stats
      });
    } catch (error) {
      logger.error("Error in getMyStats:", error);
      
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  /**
   * Get current user's quick statistics
   * @route GET /api/v1/stats/me/quick
   */
  static async getMyQuickStats(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      logger.info(`Fetching quick stats for current user: ${userId}`);

      const stats = await StatsService.getQuickStats(userId);

      res.status(200).json({
        success: true,
        message: "Your quick statistics retrieved successfully",
        data: stats
      });
    } catch (error) {
      logger.error("Error in getMyQuickStats:", error);
      
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}
