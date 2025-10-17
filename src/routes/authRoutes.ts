import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authenticate } from "../middlewares/authenticate";
import { extractClientInfo } from "../middlewares/ipExtractor";
import {
  validateLogin,
  validateRegister,
} from "../middlewares/validators/validators";
import {
  validateForgotPassword,
  validateResetPassword,
  validateVerifyResetToken,
} from "../middlewares/validators/authValidators";

const router = Router();

router.use(extractClientInfo);

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post("/register", validateRegister, AuthController.register);

/**
 * @route POST /api/v1/auth/login
 * @desc Login a user
 * @access Public
 */
router.post("/login", validateLogin, AuthController.login);

/**
 * @route POST /api/v1/auth/refresh-token
 * @desc Refresh access token
 * @access Public
 */
router.post("/refresh-token", AuthController.refreshToken);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get("/me", authenticate, AuthController.getCurrentUser);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post("/logout", authenticate, AuthController.logout);

/**
 * @route POST /api/v1/auth/forgot-password
 * @desc Request password reset
 * @access Public
 */
router.post(
  "/forgot-password",
  validateForgotPassword,
  AuthController.forgotPassword
);

/**
 * @route POST /api/v1/auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post(
  "/reset-password",
  validateResetPassword,
  AuthController.resetPassword
);

/**
 * @route GET /api/v1/auth/verify-reset-token/:token
 * @desc Verify if reset token is valid
 * @access Public
 */
router.get(
  "/verify-reset-token/:token",
  validateVerifyResetToken,
  AuthController.verifyResetToken
);

export default router;
