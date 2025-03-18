import { UUID } from "crypto";

export enum FriendshipStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  BLOCKED = "blocked",
}

export interface Friendship {
  id: UUID;
  requester_id: UUID;
  addressee_id: UUID;
  status: FriendshipStatus;
  created_at: Date;
  updated_at: Date;
}

export interface FriendshipCreate
  extends Omit<Friendship, "id" | "created_at" | "updated_at" | "status"> {
  status?: FriendshipStatus;
}

export interface FriendshipUpdate
  extends Partial<
    Omit<Friendship, "id" | "requester_id" | "addressee_id" | "created_at">
  > {}

export interface FriendSummary {
  id: UUID;
  username: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
  friendship_id: UUID;
  friendship_status: FriendshipStatus;
}
