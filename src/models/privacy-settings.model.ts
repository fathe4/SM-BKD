// src/models/privacy-settings.model.ts

import { UUID } from "crypto";

// Base privacy settings
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

export const VISIBILITY_LEVELS: VisibilityLevel[] = [
  "public",
  "friends",
  "private",
];
export const ALLOW_LEVELS: AllowLevel[] = [
  "everyone",
  "friends",
  "friends_of_friends",
  "nobody",
];

// Message privacy settings
export interface MessagePrivacySettings {
  allowMessagesFrom: AllowLevel;
  messageRetentionPeriod: MessageRetentionPeriod;
  allowMessageReadReceipts: boolean;
  allowForwarding: boolean;
  allowReplies: boolean;
}

// Message retention periods
export enum MessageRetentionPeriod {
  FOREVER = "forever",
  ONE_YEAR = "one_year",
  SIX_MONTHS = "six_months",
  THREE_MONTHS = "three_months",
  ONE_MONTH = "one_month",
  ONE_WEEK = "one_week",
  ONE_DAY = "one_day",
  AFTER_READ = "after_read",
}

// Extended privacy settings
export interface ExtendedPrivacySettings {
  messagePrivacy: any;
  allowMessagesFrom: any;
  // Base settings
  baseSettings: BasePrivacySettings;

  // General privacy
  allowFriendRequests: AllowLevel;
  allowTagging: boolean;
  showInSearch: boolean;
  showBirthDate: VisibilityLevel;
  showLocation: VisibilityLevel;
  showEmail: VisibilityLevel;
  postsDefaultVisibility: VisibilityLevel;
  showFriendsList: VisibilityLevel;

  // Security
  twoFactorAuthEnabled: boolean;
  loginNotifications: boolean;

  // Messaging privacy (using consistent property name)
  messageSettings: MessagePrivacySettings;
}

// Default values
export const DEFAULT_BASE_PRIVACY_SETTINGS: BasePrivacySettings = {
  profileVisibility: "public",
  showOnlineStatus: true,
  showLastActive: true,
};

export const DEFAULT_MESSAGE_PRIVACY_SETTINGS: MessagePrivacySettings = {
  allowMessagesFrom: "everyone",
  messageRetentionPeriod: MessageRetentionPeriod.FOREVER,
  allowMessageReadReceipts: true,
  allowForwarding: true,
  allowReplies: true,
};

export const DEFAULT_EXTENDED_PRIVACY_SETTINGS: ExtendedPrivacySettings = {
  baseSettings: DEFAULT_BASE_PRIVACY_SETTINGS,
  allowFriendRequests: "everyone",
  allowTagging: true,
  showInSearch: true,
  showBirthDate: "friends",
  showLocation: "friends",
  showEmail: "private",
  postsDefaultVisibility: "friends",
  showFriendsList: "friends",
  twoFactorAuthEnabled: false,
  loginNotifications: false,
  messageSettings: DEFAULT_MESSAGE_PRIVACY_SETTINGS,
  messagePrivacy: undefined,
  allowMessagesFrom: undefined,
};

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

export interface UserPrivacySettingsUpdate {
  settings: Partial<ExtendedPrivacySettings>;
}
