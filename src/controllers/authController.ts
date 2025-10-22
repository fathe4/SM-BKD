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
import { getActiveSubscriptionForUser } from "../services/subscriptionService";
import { EmailService } from "../services/emailService";
import crypto from "crypto";

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
      const { email, password, first_name, last_name, username, locationData } =
        req.body;

      const { user: newUser } = await UserService.createUserWithValidation({
        email,
        password,
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
        profile: {},
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
          clientInfo.deviceType,
          locationData
        ).catch(err => {
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
      const { email, password, locationData } = req.body;

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
        throw new AppError("Invalid Password", 401);
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: "30d" }
      );
      const accessTokenExpires = Date.now() + 60 * 1000;

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          id: user.id,
        },
        JWT_REFRESH_SECRET,
        { expiresIn: "45d" }
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
            clientInfo.deviceType,
            locationData
          ).catch(err => {
            logger.error("Error tracking location during login:", err);
          });
        }
      }
      // Remove sensitive information
      const { password_hash, ...userWithoutPassword } = user;

      // Check if user is premium (has active subscription)
      const subscription = await getActiveSubscriptionForUser(user.id);
      const isPremium = !!subscription;

      res.status(200).json({
        status: "success",
        message: "Logged in successfully",
        data: {
          user: userWithoutPassword,
          token,
          refreshToken,
          isPremium,
          subscription,
          accessTokenExpires,
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

      const newToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      const accessTokenExpires = Date.now() + 60 * 1000;

      res.status(200).json({
        status: "success",
        message: "Token refreshed successfully",
        data: {
          token: newToken,
          accessTokenExpires,
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

  /**
   * Forgot password - Send reset token via email
   */
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;

      // Find user by email
      const user = await UserService.findUserByEmail(email);

      // Always return success message even if user doesn't exist (security best practice)
      // This prevents email enumeration attacks
      if (!user) {
        logger.warn(
          `Password reset requested for non-existent email: ${email}`
        );
        return res.status(200).json({
          status: "success",
          message:
            "If an account with that email exists, a password reset link has been sent.",
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(200).json({
          status: "success",
          message:
            "If an account with that email exists, a password reset link has been sent.",
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      // Set token expiry (default 1 hour)
      const expiryMinutes = parseInt(
        process.env.RESET_TOKEN_EXPIRY_MINUTES || "60"
      );
      const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);

      // Save hashed token to database
      await UserService.updatePasswordResetToken(
        user.id,
        hashedToken,
        expiryDate
      );

      // Send email with reset token (use unhashed token in URL)
      try {
        await EmailService.sendPasswordResetEmail(
          user.email,
          resetToken,
          `${user.first_name} ${user.last_name}`
        );

        logger.info(`Password reset email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error("Failed to send password reset email:", emailError);
        // Clear the reset token since email failed
        await UserService.updatePasswordResetToken(user.id, null, null);

        throw new AppError(
          "Failed to send password reset email. Please try again later.",
          500
        );
      }

      res.status(200).json({
        status: "success",
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    } catch (error) {
      logger.error("Error in forgotPassword controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong. Please try again later.",
        });
      }
    }
  }

  /**
   * Reset password using token
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new AppError("Token and new password are required", 400);
      }

      // Hash the token from URL to compare with database
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // Find user with valid reset token
      const user = await UserService.findUserByResetToken(hashedToken);

      if (!user) {
        throw new AppError("Invalid or expired password reset token", 400);
      }

      // Check if token is expired
      if (
        user.reset_password_expires &&
        new Date() > new Date(user.reset_password_expires)
      ) {
        // Clear expired token
        await UserService.updatePasswordResetToken(user.id, null, null);
        throw new AppError("Password reset token has expired", 400);
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and clear reset token
      await UserService.updatePassword(user.id, hashedPassword);
      await UserService.updatePasswordResetToken(user.id, null, null);

      // Send confirmation email
      try {
        await EmailService.sendPasswordResetConfirmation(
          user.email,
          `${user.first_name} ${user.last_name}`
        );
      } catch (emailError) {
        logger.error("Failed to send password reset confirmation:", emailError);
        // Don't throw error here, password was already reset successfully
      }

      logger.info(`Password successfully reset for user: ${user.email}`);

      res.status(200).json({
        status: "success",
        message:
          "Password has been reset successfully. You can now login with your new password.",
      });
    } catch (error) {
      logger.error("Error in resetPassword controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong. Please try again later.",
        });
      }
    }
  }

  /**
   * Verify reset token validity
   */
  static async verifyResetToken(req: Request, res: Response) {
    try {
      const { token } = req.params;

      if (!token) {
        throw new AppError("Token is required", 400);
      }

      // Hash the token to compare with database
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      // Find user with valid reset token
      const user = await UserService.findUserByResetToken(hashedToken);

      if (!user) {
        throw new AppError("Invalid password reset token", 400);
      }

      // Check if token is expired
      if (
        user.reset_password_expires &&
        new Date() > new Date(user.reset_password_expires)
      ) {
        // Clear expired token
        await UserService.updatePasswordResetToken(user.id, null, null);
        throw new AppError("Password reset token has expired", 400);
      }

      res.status(200).json({
        status: "success",
        message: "Token is valid",
        data: {
          email: user.email,
        },
      });
    } catch (error) {
      logger.error("Error in verifyResetToken controller:", error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          status: error.status,
          message: error.message,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Something went wrong. Please try again later.",
        });
      }
    }
  }
}
