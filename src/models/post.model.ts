import { UUID } from "crypto";
import { GeoCoordinates } from "./profile.model";

export enum PostFeelingType {
  HAPPY = "happy",
  SAD = "sad",
  EXCITED = "excited",
  ANGRY = "angry",
  THANKFUL = "thankful",
  LOVED = "loved",
  TIRED = "tired",
  CONFUSED = "confused",
  OTHER = "other",
}

export enum PostVisibility {
  PUBLIC = "public",
  FRIENDS = "friends",
  PRIVATE = "private",
}

export interface PostLocation {
  name: string;
  coordinates: GeoCoordinates;
}

export interface Post {
  id: UUID;
  user_id: UUID;
  content?: string;
  media?: string[]; // Array of media URLs
  feeling?: PostFeelingType;
  visibility: PostVisibility;
  is_boosted: boolean;
  boost_until?: Date;
  created_at: Date;
  updated_at: Date;
  location?: PostLocation;
  is_deleted: boolean;
  view_count: number;
}

export interface PostCreate
  extends Omit<
    Post,
    | "id"
    | "created_at"
    | "updated_at"
    | "is_boosted"
    | "boost_until"
    | "view_count"
    | "is_deleted"
  > {
  is_boosted?: boolean;
  boost_until?: Date;
}

export interface PostUpdate
  extends Partial<Omit<Post, "id" | "user_id" | "created_at" | "updated_at">> {}

export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
  DOCUMENT = "document",
}

export interface PostMedia {
  id: UUID;
  post_id: UUID;
  media_url: string;
  media_type: MediaType;
  order: number;
  created_at: Date;
}

export interface PostMediaCreate extends Omit<PostMedia, "id" | "created_at"> {}
