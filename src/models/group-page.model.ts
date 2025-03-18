import { UUID } from "crypto";

export enum Visibility {
  PUBLIC = "public",
  PRIVATE = "private",
  SECRET = "secret",
}

export enum MemberRole {
  ADMIN = "admin",
  MODERATOR = "moderator",
  MEMBER = "member",
}

export enum PageFollowerRole {
  ADMIN = "admin",
  EDITOR = "editor",
  FOLLOWER = "follower",
}

export enum CategoryType {
  GROUP = "group",
  PAGE = "page",
  MARKETPLACE = "marketplace",
}

export interface Category {
  id: UUID;
  name: string;
  description?: string;
  parent_id?: UUID; // For subcategories, nullable
  category_type: CategoryType;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryCreate
  extends Omit<Category, "id" | "created_at" | "updated_at"> {}

export interface Group {
  id: UUID;
  creator_id: UUID;
  name: string;
  description?: string;
  cover_picture?: string;
  visibility: Visibility;
  category_id?: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface GroupCreate
  extends Omit<Group, "id" | "created_at" | "updated_at"> {}

export interface GroupUpdate
  extends Partial<
    Omit<Group, "id" | "creator_id" | "created_at" | "updated_at">
  > {}

export interface GroupMember {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: Date;
}

export interface GroupMemberCreate
  extends Omit<GroupMember, "id" | "joined_at"> {}

export interface GroupMemberUpdate
  extends Partial<
    Omit<GroupMember, "id" | "group_id" | "user_id" | "joined_at">
  > {}

export interface Page {
  id: UUID;
  creator_id: UUID;
  name: string;
  description?: string;
  profile_picture?: string;
  cover_picture?: string;
  category_id?: UUID;
  created_at: Date;
  updated_at: Date;
}

export interface PageCreate
  extends Omit<Page, "id" | "created_at" | "updated_at"> {}

export interface PageUpdate
  extends Partial<
    Omit<Page, "id" | "creator_id" | "created_at" | "updated_at">
  > {}

export interface PageFollower {
  id: UUID;
  page_id: UUID;
  user_id: UUID;
  role: PageFollowerRole;
  followed_at: Date;
}

export interface PageFollowerCreate
  extends Omit<PageFollower, "id" | "followed_at"> {}

export interface PageFollowerUpdate
  extends Partial<
    Omit<PageFollower, "id" | "page_id" | "user_id" | "followed_at">
  > {}
