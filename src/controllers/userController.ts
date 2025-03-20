/* eslint-disable @typescript-eslint/no-unused-vars */
// src/controllers/userController.ts
import { Request, Response } from "express";
import { UserService } from "../services/userService";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import bcrypt from "bcryptjs";
import { UserRole } from "../types/models";

export class UserController {
  /**
   * Get all users with pagination, filtering and search
   * @route GET /api/v1/users
   */
  static async getUsers(req: Request, res: Response) {
    try {
      // Log incoming query parameters for debugging
      logger.info(`Query parameters: ${JSON.stringify(req.query)}`);

      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const search = req.query.search as string;
      const role = req.query.role as UserRole;
      const is_verified = req.query.is_verified === "true";
      const is_active = req.query.is_active === "true";
      const sort_by = req.query.sort_by as string;
      const order = req.query.order as "asc" | "desc";

      // Log processed parameters for debugging
      logger.info(
        `Processed parameters: page=${page}, limit=${limit}, search=${search}, role=${role}`
      );

      // Only pass defined parameters to the service
      const options: {
        page: number;
        limit: number;
        search?: string;
        role?: UserRole;
        is_verified?: boolean;
        is_active?: boolean;
        sort_by?: string;
        order?: "asc" | "desc";
      } = {
        page,
        limit,
      };

      if (search) options.search = search;
      if (role) options.role = role;
      if (req.query.is_verified !== undefined)
        options.is_verified = is_verified;
      if (req.query.is_active !== undefined) options.is_active = is_active;
      if (sort_by) options.sort_by = sort_by;
      if (order) options.order = order;

      // Log options being sent to service
      logger.info(`Options sent to service: ${JSON.stringify(options)}`);

      const { users, total } = await UserService.getUsers(options);

      // Log number of users returned
      logger.info(`Number of users returned: ${users.length}`);

      // Remove sensitive information
      const safeUsers = users.map((user) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      res.status(200).json({
        status: "success",
        results: users.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: {
          users: safeUsers,
        },
      });
    } catch (error) {
      logger.error("Error in getUsers controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Get a user by ID
   * @route GET /api/v1/users/:id
   */
  static async getUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await UserService.findUserById(id);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Remove sensitive information
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...userWithoutPassword } = user;

      res.status(200).json({
        status: "success",
        data: {
          user: userWithoutPassword,
        },
      });
    } catch (error) {
      logger.error("Error in getUser controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Create a new user
   * @route POST /api/v1/users
   */
  static async createUser(req: Request, res: Response) {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        username,
        role,
        ...rest
      } = req.body;

      // Check if user already exists
      const existingUser = await UserService.findUserByEmail(email);
      if (existingUser) {
        throw new AppError("Email already in use", 400);
      }

      // Check if username is taken
      const existingUsername = await UserService.findUserByUsername(username);
      if (existingUsername) {
        throw new AppError("Username already taken", 400);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await UserService.createUser({
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        username,
        role: role || UserRole.USER,
        is_verified: false,
        is_active: true,
        ...rest,
      });

      // Remove sensitive information
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash: _, ...userWithoutPassword } = newUser;

      res.status(201).json({
        status: "success",
        data: {
          user: userWithoutPassword,
        },
      });
    } catch (error) {
      logger.error("Error in createUser controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Update a user
   * @route PATCH /api/v1/users/:id
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        email, // We don't allow email change through this endpoint
        password, // Password change has a separate endpoint
        ...updateData
      } = req.body;

      // Check if user exists
      const existingUser = await UserService.findUserById(id);
      if (!existingUser) {
        throw new AppError("User not found", 404);
      }

      // Check if username is being changed and if it's already taken
      if (
        updateData.username &&
        updateData.username !== existingUser.username
      ) {
        const existingUsername = await UserService.findUserByUsername(
          updateData.username
        );
        if (existingUsername) {
          throw new AppError("Username already taken", 400);
        }
      }

      // Update user
      const updatedUser = await UserService.updateUser(id, updateData);

      // Remove sensitive information
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...userWithoutPassword } = updatedUser;

      res.status(200).json({
        status: "success",
        data: {
          user: userWithoutPassword,
        },
      });
    } catch (error) {
      logger.error("Error in updateUser controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Delete a user
   * @route DELETE /api/v1/users/:id
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await UserService.findUserById(id);
      if (!existingUser) {
        throw new AppError("User not found", 404);
      }

      // Delete user
      await UserService.deleteUser(id);

      res.status(204).send();
    } catch (error) {
      logger.error("Error in deleteUser controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong",
        });
      }
    }
  }

  /**
   * Change user password
   * @route PATCH /api/v1/users/:id/password
   */
  //   static async changePassword(req: Request, res: Response) {
  //     try {
  //       const { id } = req.params;
  //       const { currentPassword, newPassword } = req.body;

  //       // Check if user exists
  //       const user = await UserService.findUserById(id);
  //       if (!user) {
  //         throw new AppError("User not found", 404);
  //       }

  //       // Verify current password
  //       const isPasswordValid = await bcrypt.compare(
  //         currentPassword,
  //         user.password_hash
  //       );

  //       if (!isPasswordValid) {
  //         throw new AppError("Current password is incorrect", 401);
  //       }

  //       // Change password
  //       await UserService.changePassword(id, newPassword);

  //       res.status(200).json({
  //         status: "success",
  //         message: "Password changed successfully",
  //       });
  //     } catch (error) {
  //       logger.error("Error in changePassword controller:", error);
  //       if (error instanceof AppError) {
  //         res.status(error.statusCode).json({
  //           status: error.status,
  //           message: error.message,
  //         });
  //       } else {
  //         res.status(500).json({
  //           status: "error",
  //           message: "Something went wrong",
  //         });
  //       }
  //     }
  //   }
}
