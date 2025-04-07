// src/routes/privacySettingsRoutes.ts

import { Router } from "express";
import { PrivacySettingsController } from "../controllers/privacySettingsController";
import { authenticate } from "../middlewares/authenticate";
import { validatePrivacySettings } from "../middlewares/validators/privacySettingsValidator";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/privacy-settings
 * @desc Get current user's privacy settings
 * @access Private
 */
router.get("/", PrivacySettingsController.getMyPrivacySettings);

/**
 * @route PUT /api/v1/privacy-settings
 * @desc Update all privacy settings
 * @access Private
 */
router.put(
  "/",
  validatePrivacySettings.fullSettings,
  PrivacySettingsController.updatePrivacySettings
);

/**
 * @route PATCH /api/v1/privacy-settings/base
 * @desc Update base privacy settings
 * @access Private
 */
router.patch(
  "/base",
  validatePrivacySettings.baseSettings,
  PrivacySettingsController.updateBaseSettings
);

/**
 * @route PATCH /api/v1/privacy-settings/messages
 * @desc Update message privacy settings
 * @access Private
 */
router.patch(
  "/messages",
  validatePrivacySettings.messageSettings,
  PrivacySettingsController.updateMessageSettings
);

/**
 * @route POST /api/v1/privacy-settings/reset
 * @desc Reset all privacy settings to default
 * @access Private
 */
router.post("/reset", PrivacySettingsController.resetPrivacySettings);

export default router;
