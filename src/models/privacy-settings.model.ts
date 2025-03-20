// src/models/privacy-settings.model.ts
import { UUID } from "crypto";

// Base privacy settings (matches existing UserSettings.privacy)
export interface BasePrivacySettings {
  profileVisibility: "public" | "friends" | "private";
  showOnlineStatus: boolean;
  showLastActive: boolean;
}

export type VisibilityLevel = "public" | "friends" | "private";
export type AllowLevel =
  | "everyone"
  | "friends"
  | "friends_of_friends"
  | "nobody";

// Extended privacy settings (will be stored in separate table)
export interface ExtendedPrivacySettings {
  // Base settings (same as in UserSettings)
  baseSettings: BasePrivacySettings;

  // Additional settings
  allowFriendRequests: AllowLevel;
  allowTagging: boolean;
  showInSearch: boolean;
  allowMessagesFrom: AllowLevel;
  showBirthDate: VisibilityLevel;
  showLocation: VisibilityLevel;
  showEmail: VisibilityLevel;
  postsDefaultVisibility: VisibilityLevel;
  showFriendsList: VisibilityLevel;
  twoFactorAuthEnabled: boolean;
  loginNotifications: boolean;
}

// Default values for extended privacy settings
export const DEFAULT_BASE_PRIVACY_SETTINGS: BasePrivacySettings = {
  profileVisibility: "public",
  showOnlineStatus: true,
  showLastActive: true,
};

export const DEFAULT_EXTENDED_PRIVACY_SETTINGS: ExtendedPrivacySettings = {
  baseSettings: DEFAULT_BASE_PRIVACY_SETTINGS,
  allowFriendRequests: "everyone",
  allowTagging: true,
  showInSearch: true,
  allowMessagesFrom: "everyone",
  showBirthDate: "friends",
  showLocation: "friends",
  showEmail: "private",
  postsDefaultVisibility: "friends",
  showFriendsList: "friends",
  twoFactorAuthEnabled: false,
  loginNotifications: false,
};

// For updating privacy settings
export type BasePrivacySettingsUpdate = Partial<BasePrivacySettings>;
export type ExtendedPrivacySettingsUpdate = Partial<ExtendedPrivacySettings>;

// Database model
export interface UserPrivacySettingsRecord {
  id: UUID;
  user_id: UUID;
  settings: ExtendedPrivacySettings;
  created_at: Date;
  updated_at: Date;
}

export interface UserPrivacySettingsCreate {
  user_id: UUID;
  settings: ExtendedPrivacySettings;
}
