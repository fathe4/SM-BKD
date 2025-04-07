// src/controllers/privacySettingsController.ts

import { Request, Response } from "express";
import { PrivacySettingsService } from "../services/privacySettingsService";
import { controllerHandler } from "../utils/controllerHandler";
import { DEFAULT_EXTENDED_PRIVACY_SETTINGS } from "../models/privacy-settings.model";
import { UUID } from "crypto";

export class PrivacySettingsController {
  /**
   * Get the current user's privacy settings
   */
  static getMyPrivacySettings = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      const privacySettings =
        await PrivacySettingsService.getUserPrivacySettings(userId);

      res.status(200).json({
        status: "success",
        data: {
          privacySettings: privacySettings.settings,
        },
      });
    }
  );

  /**
   * Update privacy settings for the current user
   */
  static updatePrivacySettings = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const { settings } = req.body;

      const updatedSettings =
        await PrivacySettingsService.updateUserPrivacySettings(userId, {
          settings,
        });

      res.status(200).json({
        status: "success",
        data: {
          privacySettings: updatedSettings.settings,
        },
      });
    }
  );

  /**
   * Update just base privacy settings
   */
  static updateBaseSettings = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const baseSettings = req.body;

      const updatedSettings = await PrivacySettingsService.updatePrivacySection(
        userId,
        "baseSettings",
        baseSettings
      );

      res.status(200).json({
        status: "success",
        data: {
          baseSettings: updatedSettings.settings.baseSettings,
        },
      });
    }
  );

  /**
   * Update just message privacy settings
   */
  static updateMessageSettings = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;
      const messageSettings = req.body;

      const updatedSettings = await PrivacySettingsService.updatePrivacySection(
        userId,
        "messageSettings",
        messageSettings
      );

      res.status(200).json({
        status: "success",
        data: {
          messageSettings: updatedSettings.settings.messageSettings,
        },
      });
    }
  );

  /**
   * Reset all privacy settings to default
   */
  static resetPrivacySettings = controllerHandler(
    async (req: Request, res: Response) => {
      const userId = req.user!.id as UUID;

      await PrivacySettingsService.resetPrivacySettings(userId);

      res.status(200).json({
        status: "success",
        message: "Privacy settings reset to default",
        data: {
          privacySettings: DEFAULT_EXTENDED_PRIVACY_SETTINGS,
        },
      });
    }
  );
}
