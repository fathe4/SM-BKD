import { UUID } from "crypto";

export enum ReferenceType {
  POST = "post",
  COMMENT = "comment",
  FRIEND_REQUEST = "friend_request",
  MESSAGE = "message",
  GROUP_INVITE = "group_invite",
  PAGE_INVITE = "page_invite",
  MENTION = "mention",
  REACTION = "reaction",
  GROUP_POST = "group_post",
  PAGE_POST = "page_post",
  STORY_VIEW = "story_view",
  MARKETPLACE = "marketplace",
}

export interface Notification {
  id: UUID;
  user_id: UUID;
  actor_id: UUID;
  reference_id: UUID; // Post, comment, etc. ID
  reference_type: ReferenceType;
  content: string;
  is_read: boolean;
  created_at: Date;
}

export interface NotificationCreate
  extends Omit<Notification, "id" | "created_at" | "is_read"> {
  is_read?: boolean;
}

export interface NotificationUpdate
  extends Partial<
    Omit<
      Notification,
      | "id"
      | "user_id"
      | "actor_id"
      | "reference_id"
      | "reference_type"
      | "created_at"
    >
  > {}

export interface NotificationSummary {
  id: UUID;
  actor: {
    id: UUID;
    username: string;
    profile_picture?: string;
  };
  content: string;
  reference_type: ReferenceType;
  is_read: boolean;
  created_at: Date;
}
