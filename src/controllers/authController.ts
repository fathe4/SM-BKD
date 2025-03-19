/* eslint-disable @typescript-eslint/no-unused-vars */
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserService } from "../services/userService";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { LocationSource, UserRole } from "../types/models";
import { config } from "dotenv";
import { IpLocationService } from "../services/ipLocationService";
import { ProfileService } from "../services/profileService";

config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "your_refresh_token_secret_here";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

/**
 * Authentication controller
 */
export class AuthController {
  /**
   * Register a new user
   */
  // src/controllers/authController.ts
  // Modify the register method to include profile creation

  /**
   * Register a new user
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, first_name, last_name, username } = req.body;

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
        role: UserRole.USER,
        is_verified: false,
        is_active: true,
        settings: {
          notifications: {
            email: true,
            push: true,
            inApp: true,
          },
          privacy: {
            profileVisibility: "public",
            showOnlineStatus: true,
            showLastActive: true,
          },
          theme: "light",
          language: "en",
        },
      });

      // Create a basic profile for the user
      await ProfileService.upsertProfile({
        user_id: newUser.id,
        // Add any default profile data you want to include
        // This can be minimal or include data from registration if available
      });

      // Generate token
      const token = jwt.sign(
        { id: newUser.id },
        process.env.JWT_SECRET || "default_secret",
        { expiresIn: "7d" }
      );

      // Track user device and location
      const clientInfo = (req as any).clientInfo;
      if (clientInfo) {
        IpLocationService.trackLoginLocation(
          newUser.id,
          clientInfo.ipAddress,
          clientInfo.deviceToken,
          clientInfo.deviceType
        ).catch((err) => {
          // Silently log the error but don't disrupt login process
          logger.error("Error tracking location during registration:", err);
        });
      }

      res.status(201).json({
        status: "success",
        token,
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            username: newUser.username,
            first_name: newUser.first_name,
            last_name: newUser.last_name,
          },
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        logger.error("Registration error:", error);
        res.status(500).json({
          status: "error",
          message: "An error occurred during registration",
        });
      }
    }
  }
  /**
   * Login user
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await UserService.findUserByEmail(email);
      if (!user) {
        throw new AppError("Invalid credentials", 401);
      }

      // Check if user is active
      if (!user.is_active) {
        throw new AppError("Your account has been deactivated", 403);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash
      );
      if (!isPasswordValid) {
        throw new AppError("Invalid credentials", 401);
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: "7d" }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          id: user.id,
        },
        JWT_REFRESH_SECRET,
        { expiresIn: "7d" }
      );

      // Track user's device and location if provided
      const clientInfo = res.locals.clientInfo;

      if (clientInfo) {
        // Skip geolocation API call for local IPs in development
        if (clientInfo.isLocalIp && process.env.NODE_ENV === "development") {
          logger.info(
            "Skipping geolocation API call for local IP in development environment"
          );
        } else {
          IpLocationService.trackLoginLocation(
            user.id,
            clientInfo.ipAddress,
            clientInfo.deviceToken,
            clientInfo.deviceType
          ).catch((err) => {
            logger.error("Error tracking location during login:", err);
          });
        }
      }
      // Remove sensitive information
      const { password_hash, ...userWithoutPassword } = user;

      res.status(200).json({
        status: "success",
        message: "Logged in successfully",
        data: {
          user: userWithoutPassword,
          token,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Error in login controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong during login",
        });
      }
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError("No refresh token provided", 400);
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
        id: string;
      };

      // Find user
      const user = await UserService.findUserById(decoded.id);
      if (!user) {
        throw new AppError("Invalid refresh token", 401);
      }

      // Check if user is active
      if (!user.is_active) {
        throw new AppError("Your account has been deactivated", 403);
      }

      // Generate new access token

      const newToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(200).json({
        status: "success",
        message: "Token refreshed successfully",
        data: {
          token: newToken,
        },
      });
    } catch (error) {
      logger.error("Error in refreshToken controller:", error);
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          status: "fail",
          message: "Invalid refresh token",
        });
      } else if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong during token refresh",
        });
      }
    }
  }

  /**
   * Get current user profile
   */
  static async getCurrentUser(req: Request, res: Response) {
    try {
      // User ID is attached by the auth middleware
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError("Not authenticated", 401);
      }

      const user = await UserService.findUserById(userId);
      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Remove sensitive information
      const { password_hash, ...userWithoutPassword } = user;

      res.status(200).json({
        status: "success",
        data: {
          user: userWithoutPassword,
        },
      });
    } catch (error) {
      logger.error("Error in getCurrentUser controller:", error);
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
   * Logout user
   */
  static async logout(req: Request, res: Response) {
    try {
      // In a stateless JWT setup, the client is responsible for discarding the token
      // We could implement a token blacklist here if needed

      // Update user's device if provided
      if (req.user?.id && req.body.device_token) {
        // Set the device as inactive or update last active time
        await UserService.updateUserDevice(req.user.id, req.body.device_token, {
          last_active: new Date().toISOString(),
        });
      }

      res.status(200).json({
        status: "success",
        message: "Logged out successfully",
      });
    } catch (error) {
      logger.error("Error in logout controller:", error);
      res.status(500).json({
        status: "error",
        message: "Something went wrong during logout",
      });
    }
  }
}
