import { UUID } from "crypto";

export enum UserRole {
  ADMIN = "admin",
  MODERATOR = "moderator",
  USER = "user",
}

export interface UserSettings {
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  privacy: {
    profileVisibility: "public" | "friends" | "private";
    showOnlineStatus: boolean;
    showLastActive: boolean;
  };
  theme: "light" | "dark" | "system";
  language: string;
}

export interface ContactInfo {
  phone?: string;
  website?: string;
  email?: string;
  socialLinks?: {
    [key: string]: string;
  };
}

export interface User {
  id: UUID;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  username: string;
  profile_picture?: string;
  cover_picture?: string;
  bio?: string;
  location?: string;
  contact_info?: ContactInfo;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
  is_verified: boolean;
  is_active: boolean;
  settings: UserSettings;
}

export interface UserCreate
  extends Omit<User, "id" | "created_at" | "updated_at" | "password_hash"> {
  password: string;
}

export interface UserUpdate
  extends Partial<
    Omit<User, "id" | "email" | "created_at" | "updated_at" | "password_hash">
  > {
  password?: string;
}

export interface UserPublicProfile {
  id: UUID;
  username: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
  cover_picture?: string;
  bio?: string;
  location?: string;
  is_verified: boolean;
}
