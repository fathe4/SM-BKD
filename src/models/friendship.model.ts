export enum FriendshipStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  BLOCKED = "blocked",
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
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
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_picture?: string;
  bio?: string;
  location?: string;
  friendship_id?: string;
  chat_id?: string;
  friendship_status?: FriendshipStatus;
}
