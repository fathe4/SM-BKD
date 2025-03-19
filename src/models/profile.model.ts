import { UUID } from "crypto";

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface UserInterests {
  categories: string[];
  tags: string[];
}

export type RelationshipStatus =
  | "single"
  | "in_relationship"
  | "engaged"
  | "married"
  | "complicated"
  | "separated"
  | "divorced"
  | "widowed"
  | "not_specified";

export interface Profile {
  id: UUID;
  user_id: string;
  location?: string;
  coordinates?: GeoCoordinates;
  interests?: UserInterests;
  birth_date?: Date;
  occupation?: string;
  education?: string;
  relationship_status?: RelationshipStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileCreate
  extends Omit<Profile, "id" | "created_at" | "updated_at"> {}

export interface ProfileUpdate
  extends Partial<
    Omit<Profile, "id" | "user_id" | "created_at" | "updated_at">
  > {}
