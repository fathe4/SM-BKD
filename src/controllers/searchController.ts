// src/controllers/searchController.ts
import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { SearchService } from "../services/searchService";

export class SearchController {
  /**
   * Search users by text query
   * GET /api/v1/search/users?q={query}&page={page}&limit={limit}
   */
  static async searchUsers(req: Request, res: Response) {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sortBy =
        (req.query.sortBy as "relevance" | "name" | "newest") || "relevance";

      if (!query) {
        throw new AppError("Search query is required", 400);
      }

      const result = await SearchService.searchUsers(query, {
        page,
        limit,
        sortBy,
      });

      res.status(200).json({
        status: "success",
        ...result,
      });
    } catch (error) {
      logger.error("Error in searchUsers controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to search users",
        });
      }
    }
  }

  /**
   * Advanced search for users with multiple criteria
   * POST /api/v1/search/users/advanced
   */
  static async advancedUserSearch(req: Request, res: Response) {
    try {
      const {
        query,
        location,
        interests,
        ageRange,
        sortBy = "relevance",
        page = 1,
        limit = 10,
      } = req.body;

      // At least one search parameter should be provided
      if (
        !query &&
        !location &&
        (!interests || interests.length === 0) &&
        !ageRange
      ) {
        throw new AppError("At least one search parameter is required", 400);
      }

      const result = await SearchService.advancedUserSearch({
        query,
        location,
        interests,
        ageRange,
        sortBy,
        page,
        limit,
      });

      res.status(200).json({
        status: "success",
        ...result,
      });
    } catch (error) {
      logger.error("Error in advancedUserSearch controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to perform advanced user search",
        });
      }
    }
  }

  /**
   * Search for users near the authenticated user
   * GET /api/v1/search/users/nearby?radius={km}&page={page}&limit={limit}
   */
  //   static async searchUsersNearby(req: Request, res: Response) {
  //     try {
  //       if (!req.user) {
  //         throw new AppError("Authentication required", 401);
  //       }

  //       const userId = req.user.id;
  //       const radius = parseFloat(req.query.radius as string) || 10;
  //       const page = parseInt(req.query.page as string) || 1;
  //       const limit = parseInt(req.query.limit as string) || 10;

  //       if (radius <= 0 || radius > 100) {
  //         throw new AppError("Radius must be between 0 and 100 kilometers", 400);
  //       }

  //       const result = await SearchService.searchUsersNearby(userId, radius, {
  //         page,
  //         limit,
  //       });

  //       res.status(200).json({
  //         status: "success",
  //         ...result,
  //       });
  //     } catch (error) {
  //       logger.error("Error in searchUsersNearby controller:", error);
  //       if (error instanceof AppError) {
  //         res.status(error.statusCode).json({
  //           status: error.status,
  //           message: error.message,
  //         });
  //       } else {
  //         res.status(500).json({
  //           status: "error",
  //           message: "Failed to search users nearby",
  //         });
  //       }
  //     }
  //   }
}
