// src/services/privacySettingsService.ts
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { asyncHandler } from "../utils/asyncHandler";
import {
  UserPrivacySettingsRecord,
  ExtendedPrivacySettings,
  ExtendedPrivacySettingsUpdate,
  DEFAULT_EXTENDED_PRIVACY_SETTINGS,
  MessagePrivacySettings,
} from "../models/privacy-settings.model";
import { UUID } from "crypto";

/**
 * Service for managing user privacy settings
 */
export class PrivacySettingsService {
  /**
   * Get user privacy settings
   */
  static getUserPrivacySettings = asyncHandler(
    async (userId: UUID): Promise<UserPrivacySettingsRecord> => {
      // Check if settings exist
      const { data, error } = await supabase
        .from("user_privacy_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw new AppError(
          `Failed to get privacy settings: ${error.message}`,
          400
        );
      }

      // If settings don't exist, create default settings
      if (!data) {
        return await this.createDefaultPrivacySettings(userId);
      }

      // Ensure settings structure is complete by merging with defaults
      if (!data.settings) {
        data.settings = DEFAULT_EXTENDED_PRIVACY_SETTINGS;
      } else {
        // Deep merge with defaults to ensure all properties exist
        data.settings = this.mergeWithDefaults(data.settings);
      }

      return data as UserPrivacySettingsRecord;
    },
    "Failed to get user privacy settings"
  );

  /**
   * Create default privacy settings for a user
   */
  static createDefaultPrivacySettings = asyncHandler(
    async (userId: UUID): Promise<UserPrivacySettingsRecord> => {
      const defaultSettings = {
        user_id: userId,
        settings: DEFAULT_EXTENDED_PRIVACY_SETTINGS,
      };

      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .insert(defaultSettings)
        .select()
        .single();

      if (error) {
        throw new AppError(
          `Failed to create default privacy settings: ${error.message}`,
          400
        );
      }

      return data as UserPrivacySettingsRecord;
    },
    "Failed to create default privacy settings"
  );

  /**
   * Update user privacy settings
   */
  static updatePrivacySettings = asyncHandler(
    async (
      userId: UUID,
      updates: ExtendedPrivacySettingsUpdate
    ): Promise<UserPrivacySettingsRecord> => {
      // Get current settings
      const currentSettings = await this.getUserPrivacySettings(userId);

      // Prepare the updated settings by deep merging
      const updatedSettings = {
        ...currentSettings.settings,
      };

      // Update top-level properties
      for (const [key, value] of Object.entries(updates)) {
        // Skip messageSettings which is handled specially
        if (key !== "messageSettings") {
          updatedSettings[key] = value;
        }
      }

      // Update message settings if provided
      if (updates.messageSettings) {
        updatedSettings.messageSettings = {
          ...updatedSettings.messageSettings,
          ...updates.messageSettings,
        };
      }

      // Update in database
      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .update({ settings: updatedSettings })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw new AppError(
          `Failed to update privacy settings: ${error.message}`,
          400
        );
      }

      return data as UserPrivacySettingsRecord;
    },
    "Failed to update privacy settings"
  );

  /**
   * Toggle message auto-deletion setting and update hours if provided
   */
  static toggleMessageAutoDelete = asyncHandler(
    async (
      userId: UUID,
      enable: boolean,
      hours?: number
    ): Promise<UserPrivacySettingsRecord> => {
      // Validate hours if provided
      if (hours !== undefined && hours <= 0) {
        throw new AppError("Auto-delete hours must be greater than 0", 400);
      }

      // Build the update object
      const updateData: ExtendedPrivacySettingsUpdate = {
        messageSettings: {
          autoDeleteEnabled: enable,
        },
      };

      // Only update hours if provided
      if (hours !== undefined) {
        updateData.messageSettings.autoDeleteHours = hours;
      }

      return await this.updatePrivacySettings(userId, updateData);
    },
    "Failed to toggle message auto-deletion"
  );

  /**
   * Get user's message auto-deletion settings
   */
  static getMessagePrivacySettings = asyncHandler(
    async (userId: UUID): Promise<MessagePrivacySettings> => {
      const settings = await this.getUserPrivacySettings(userId);
      return settings.settings.messageSettings;
    },
    "Failed to get message privacy settings"
  );

  /**
   * Helper to merge settings with defaults to ensure all properties exist
   */
  private static mergeWithDefaults(
    settings: Partial<ExtendedPrivacySettings>
  ): ExtendedPrivacySettings {
    const result = { ...DEFAULT_EXTENDED_PRIVACY_SETTINGS };

    // Merge base settings if provided
    if (settings.baseSettings) {
      result.baseSettings = {
        ...result.baseSettings,
        ...settings.baseSettings,
      };
    }

    // Merge message settings if provided
    if (settings.messageSettings) {
      result.messageSettings = {
        ...result.messageSettings,
        ...settings.messageSettings,
      };
    }

    // Merge all other top-level properties
    for (const [key, value] of Object.entries(settings)) {
      if (key !== "baseSettings" && key !== "messageSettings") {
        result[key] = value;
      }
    }

    return result;
  }
}
