import { MemberRole } from "../models";

// Base model interface with common fields
export interface BaseModel {
  id: string;
  created_at: string;
  updated_at: string;
}

// User role types
export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  MODERATOR = "moderator",
  USER = "user",
}

// User model interface
export interface User extends BaseModel {
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  username: string;
  profile_picture?: string;
  cover_picture?: string;
  bio?: string;
  location?: string;
  contact_info?: Record<string, any>;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  settings?: Record<string, any>;
  reset_password_token?: string | null;
  reset_password_expires?: string | null;
}

// Profile model interface with additional user details
export interface Profile extends BaseModel {
  user_id: string;
  location?: string;
  coordinates?: [number, number]; // [longitude, latitude]
  interests?: string[];
  birth_date?: string;
  occupation?: string;
  education?: string;
  relationship_status?: string;
}

// Friendship status enum
export enum FriendshipStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  BLOCKED = "blocked",
}

// Friendship model interface
export interface Friendship extends BaseModel {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
}

// Location source type
export enum LocationSource {
  GPS = "gps",
  IP = "ip",
  MANUAL = "manual",
}

// User device model interface
export interface UserDevice extends BaseModel {
  user_id: string;
  device_token: string;
  device_type: string;
  ip_address: string;
  last_active: string;
}

// User location model interface
export interface UserLocation extends BaseModel {
  user_id: string;
  device_id: string;
  coordinates: [number, number]; // [longitude, latitude]
  city?: string;
  country?: string;
  ip_address?: string;
  accuracy?: number;
  is_active: boolean;
  location_source: LocationSource;
  additional_metadata?: Record<string, any>;
}

// Add this to your profile.model.ts file
export interface ProfileWithUserDetails extends Profile {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    profile_picture?: string;
    is_verified: boolean;
  };
  age?: number; // Calculated field
}

export interface ChatParticipantDetails {
  id: string;
  chat_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: Date;
  last_read?: Date;
  user: {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    profile_picture?: string;
    is_verified?: boolean;
  };
}
