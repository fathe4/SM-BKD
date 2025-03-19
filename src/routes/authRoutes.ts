import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authenticate } from "../middlewares/authenticate";
import { extractClientInfo } from "../middlewares/ipExtractor";
import {
  validateLogin,
  validateRegister,
} from "../middlewares/validators/validators";

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

export default router;
