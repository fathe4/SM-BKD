import { UUID } from "crypto";

export enum ReactionType {
  LIKE = "like",
  LOVE = "love",
  HAHA = "haha",
  WOW = "wow",
  SAD = "sad",
  ANGRY = "angry",
}

export enum TargetType {
  POST = "post",
  COMMENT = "comment",
}
export interface Reaction {
  id: UUID;
  user_id: UUID;
  target_id: UUID; // Post or comment ID
  target_type: TargetType;
  reaction_type: ReactionType;
  created_at: Date;
}

export interface ReactionCreate extends Omit<Reaction, "id" | "created_at"> {}

export interface Comment {
  id: UUID;
  user_id: UUID;
  post_id: UUID;
  parent_id?: UUID; // For replies, nullable
  content: string;
  media?: string[]; // Optional media
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

export interface CommentCreate
  extends Omit<Comment, "id" | "created_at" | "updated_at" | "is_deleted"> {}

export interface CommentUpdate
  extends Partial<
    Omit<
      Comment,
      "id" | "user_id" | "post_id" | "parent_id" | "created_at" | "updated_at"
    >
  > {}

export interface Reaction {
  id: UUID;
  user_id: UUID;
  target_id: UUID;
  target_type: TargetType;
  reaction_type: ReactionType;
  created_at: Date;
}

export interface ReactionCreate {
  user_id: UUID;
  target_id: UUID;
  target_type: TargetType;
  reaction_type: ReactionType;
}

export interface Reaction {
  id: UUID;
  user_id: UUID;
  target_id: UUID; // Post or comment ID
  target_type: TargetType;
  reaction_type: ReactionType;
  created_at: Date;
}

export interface ReactionCreate extends Omit<Reaction, "id" | "created_at"> {}

// Define a type for media items
export type CommentMedia = {
  url: string;
  type: string;
};

export interface CommentCreate
  extends Omit<Comment, "id" | "created_at" | "updated_at" | "is_deleted"> {}

export interface CommentUpdate
  extends Partial<
    Omit<
      Comment,
      "id" | "user_id" | "post_id" | "parent_id" | "created_at" | "updated_at"
    >
  > {}

export interface Reaction {
  id: UUID;
  user_id: UUID;
  target_id: UUID;
  target_type: TargetType;
  reaction_type: ReactionType;
  created_at: Date;
}

export interface ReactionCreate {
  user_id: UUID;
  target_id: UUID;
  target_type: TargetType;
  reaction_type: ReactionType;
}
