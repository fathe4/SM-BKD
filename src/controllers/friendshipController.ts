import { Request, Response } from "express";
import { FriendshipService } from "../services/friendshipService";
import { AppError } from "../middlewares/errorHandler";
import { FriendshipStatus } from "../models/friendship.model";
import { controllerHandler } from "../utils/controllerHandler";

export class FriendshipController {
  /**
   * Send a friend request
   * @route POST /api/v1/friendships
   */
  static sendFriendRequest = controllerHandler(
    async (req: Request, res: Response) => {
      const { addressee_id } = req.body;
      const requesterId = req.user!.id;

      if (!addressee_id) {
        throw new AppError("Addressee ID is required", 400);
      }

      const friendship = await FriendshipService.sendFriendRequest(
        requesterId,
        addressee_id
      );

      res.status(201).json({
        status: "success",
        data: {
          friendship,
        },
      });
    }
  );

  /**
   * Get a user's friendships
   * @route GET /api/v1/friendships
   */
  static getFriendships = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const paramUserId = req.query.userId as string;
      const status = req.query.status as FriendshipStatus | undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const { friendships, total } = await FriendshipService.getUserFriendships(
        userId,
        { status, page, limit }
      );

      res.status(200).json({
        status: "success",
        data: {
          friendships,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  /**
   * Get a specific friendship
   * @route GET /api/v1/friendships/:id
   */
  static getFriendship = controllerHandler(
    async (req: Request, res: Response) => {
      const friendshipId = req.params.id;
      const userId = req.user!.id;

      const friendship = await FriendshipService.getFriendshipById(
        friendshipId
      );

      if (!friendship) {
        throw new AppError("Friendship not found", 404);
      }

      // Check if the user is part of this friendship
      if (
        friendship.requester_id !== userId &&
        friendship.addressee_id !== userId
      ) {
        throw new AppError(
          "You do not have permission to view this friendship",
          403
        );
      }

      res.status(200).json({
        status: "success",
        data: {
          friendship,
        },
      });
    }
  );

  /**
   * Update friendship status (accept/reject/block)
   * @route PATCH /api/v1/friendships/:id
   */
  static updateFriendshipStatus = controllerHandler(
    async (req: Request, res: Response) => {
      const friendshipId = req.params.id;
      const userId = req.user!.id;
      const { status } = req.body;

      // Validate status
      if (!Object.values(FriendshipStatus).includes(status)) {
        throw new AppError("Invalid friendship status", 400);
      }

      // Get existing friendship
      const friendship = await FriendshipService.getFriendshipById(
        friendshipId
      );

      if (!friendship) {
        throw new AppError("Friendship not found", 404);
      }

      console.log(friendship, "friendship.addressee_id");
      console.log(userId, "riendship.addressee_id");
      console.log(friendshipId, "friendshipId");

      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI
      //   FIX THE FRIEND SYSTEM IN UI

      // Check permissions based on the action being taken
      if (
        status === FriendshipStatus.ACCEPTED ||
        status === FriendshipStatus.REJECTED
      ) {
        // Only the addressee can accept or reject
        if (friendship.addressee_id !== userId) {
          throw new AppError(
            "Only the request recipient can accept or reject friend requests",
            403
          );
        }
      } else if (status === FriendshipStatus.BLOCKED) {
        // Either user can block
        if (
          friendship.requester_id !== userId &&
          friendship.addressee_id !== userId
        ) {
          throw new AppError(
            "You do not have permission to update this friendship",
            403
          );
        }
      } else {
        // For other status changes
        throw new AppError("Invalid status change requested", 400);
      }

      // Update the friendship
      const updatedFriendship = await FriendshipService.updateFriendshipStatus(
        friendshipId,
        status
      );

      res.status(200).json({
        status: "success",
        data: {
          friendship: updatedFriendship,
        },
      });
    }
  );

  /**
   * Delete a friendship
   * @route DELETE /api/v1/friendships/:id
   */
  static deleteFriendship = controllerHandler(
    async (req: Request, res: Response) => {
      const friendshipId = req.params.id;
      const userId = req.user!.id;

      // Get existing friendship
      const friendship = await FriendshipService.getFriendshipById(
        friendshipId
      );

      if (!friendship) {
        throw new AppError("Friendship not found", 404);
      }

      // Check if the user is part of this friendship
      if (
        friendship.requester_id !== userId &&
        friendship.addressee_id !== userId
      ) {
        throw new AppError(
          "You do not have permission to delete this friendship",
          403
        );
      }

      await FriendshipService.deleteFriendship(friendshipId);

      res.status(204).send();
    }
  );

  /**
   * Get mutual friends with another user
   * @route GET /api/v1/friendships/mutual/:userId
   */
  static getMutualFriends = controllerHandler(
    async (req: Request, res: Response) => {
      const currentUserId = req.user!.id;
      const otherUserId = req.params.userId;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const { mutualFriends, total } = await FriendshipService.getMutualFriends(
        currentUserId,
        otherUserId,
        { page, limit }
      );

      res.status(200).json({
        status: "success",
        data: {
          mutualFriends,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  /**
   * Get friend suggestions
   * @route GET /api/v1/friendships/suggestions
   */
  static getFriendSuggestions = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const { suggestions, total } =
        await FriendshipService.getFriendSuggestions(userId, { page, limit });

      res.status(200).json({
        status: "success",
        data: {
          suggestions,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );

  static getUserFriendships = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.params.userId;
      const status = req.query.status as FriendshipStatus | undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      // If the user is requesting their own friendships, we can show all
      // For other users, we may need to limit what's visible based on privacy settings
      // For now, we'll allow viewing any user's friendships

      const { friendships, total } = await FriendshipService.getUserFriendships(
        userId,
        { status, page, limit }
      );

      res.status(200).json({
        status: "success",
        data: {
          friendships,
          total,
          page,
          totalPages: Math.ceil(total / limit),
          limit,
        },
      });
    }
  );
}
