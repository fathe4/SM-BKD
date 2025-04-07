// src/services/privacySettingsService.ts

import { UUID } from "crypto";
import { supabase, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import {
  ExtendedPrivacySettings,
  UserPrivacySettingsRecord,
  DEFAULT_EXTENDED_PRIVACY_SETTINGS,
  UserPrivacySettingsUpdate,
} from "../models/privacy-settings.model";

export class PrivacySettingsService {
  /**
   * Get a user's privacy settings
   */
  static async getUserPrivacySettings(
    userId: UUID
  ): Promise<UserPrivacySettingsRecord> {
    try {
      // Attempt to fetch the user's privacy settings
      const { data, error } = await supabase
        .from("user_privacy_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        logger.error("Error fetching privacy settings:", error);
        throw new AppError(error.message, 400);
      }

      // If user has no privacy settings, create default settings
      if (!data) {
        return await this.createUserPrivacySettings(
          userId,
          DEFAULT_EXTENDED_PRIVACY_SETTINGS
        );
      }

      return data as UserPrivacySettingsRecord;
    } catch (error) {
      logger.error("Error in getUserPrivacySettings:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch privacy settings", 500);
    }
  }

  /**
   * Create user privacy settings
   */
  static async createUserPrivacySettings(
    userId: UUID,
    settings: ExtendedPrivacySettings = DEFAULT_EXTENDED_PRIVACY_SETTINGS
  ): Promise<UserPrivacySettingsRecord> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .insert({
          user_id: userId,
          settings,
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating privacy settings:", error);
        throw new AppError(error.message, 400);
      }

      return data as UserPrivacySettingsRecord;
    } catch (error) {
      logger.error("Error in createUserPrivacySettings:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create privacy settings", 500);
    }
  }

  /**
   * Update a user's privacy settings
   */
  static async updateUserPrivacySettings(
    userId: UUID,
    updateData: UserPrivacySettingsUpdate
  ): Promise<UserPrivacySettingsRecord> {
    try {
      // Get current settings
      const currentSettings = await this.getUserPrivacySettings(userId);

      // Merge current settings with new updates
      const updatedSettings = {
        ...currentSettings.settings,
        ...updateData.settings,
      };

      // Update in the database
      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating privacy settings:", error);
        throw new AppError(error.message, 400);
      }

      return data as UserPrivacySettingsRecord;
    } catch (error) {
      logger.error("Error in updateUserPrivacySettings:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update privacy settings", 500);
    }
  }

  /**
   * Update specific sections of privacy settings
   */
  static async updatePrivacySection(
    userId: UUID,
    section: "baseSettings" | "messageSettings",
    sectionData: any
  ): Promise<UserPrivacySettingsRecord> {
    try {
      // Get current settings
      const currentSettings = await this.getUserPrivacySettings(userId);

      // Create a deep copy of the current settings
      const updatedSettings = JSON.parse(
        JSON.stringify(currentSettings.settings)
      );

      // Update only the specified section
      updatedSettings[section] = {
        ...updatedSettings[section],
        ...sectionData,
      };

      // Update in the database
      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        logger.error(`Error updating ${section}:`, error);
        throw new AppError(error.message, 400);
      }

      return data as UserPrivacySettingsRecord;
    } catch (error) {
      logger.error(`Error in updatePrivacySection (${section}):`, error);
      throw error instanceof AppError
        ? error
        : new AppError(`Failed to update ${section}`, 500);
    }
  }

  /**
   * Reset privacy settings to default values
   */
  static async resetPrivacySettings(
    userId: UUID
  ): Promise<UserPrivacySettingsRecord> {
    try {
      const { data, error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .update({
          settings: DEFAULT_EXTENDED_PRIVACY_SETTINGS,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error resetting privacy settings:", error);
        throw new AppError(error.message, 400);
      }

      return data as UserPrivacySettingsRecord;
    } catch (error) {
      logger.error("Error in resetPrivacySettings:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to reset privacy settings", 500);
    }
  }

  /**
   * Delete a user's privacy settings (rarely used - mainly for account deletion)
   */
  static async deletePrivacySettings(userId: UUID): Promise<void> {
    try {
      const { error } = await supabaseAdmin!
        .from("user_privacy_settings")
        .delete()
        .eq("user_id", userId);

      if (error) {
        logger.error("Error deleting privacy settings:", error);
        throw new AppError(error.message, 400);
      }
    } catch (error) {
      logger.error("Error in deletePrivacySettings:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete privacy settings", 500);
    }
  }
}
