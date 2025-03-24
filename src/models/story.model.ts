import { UUID } from "crypto";
import { MediaType } from "./post.model";

export enum StoryVisibility {
  PUBLIC = "public",
  FRIENDS = "friends",
  CLOSE_FRIENDS = "close_friends",
}

export interface Story {
  id: UUID;
  user_id: UUID;
  content?: string;
  media_url: string;
  media_type: MediaType;
  visibility: StoryVisibility;
  created_at: Date;
  expires_at: Date;
  view_count: number;
}

export interface StoryCreate
  extends Omit<Story, "id" | "created_at" | "view_count" | "expires_at"> {
  // Default expires_at to 24 hours if not provided
  expires_at?: Date;
}

export interface StoryView {
  id: UUID;
  story_id: UUID;
  viewer_id: UUID;
  viewed_at: Date;
}

export interface StoryViewCreate extends Omit<StoryView, "id" | "viewed_at"> {}

export interface StorySummary {
  id: UUID;
  user_id: UUID;
  username: string;
  profile_picture?: string;
  has_unviewed_stories: boolean;
  stories_count: number;
  latest_story_at: Date;
}
