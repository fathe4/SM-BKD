import { UUID } from "crypto";
import { MemberRole } from "./group-page.model";

export interface Chat {
  id: UUID;
  created_at: Date;
  is_group_chat: boolean;
  name?: string;
  description?: string;
  avatar?: string | null;
  creator_id?: UUID;
}

export interface ChatCreate extends Omit<Chat, "id" | "created_at"> {}

export interface ChatUpdate
  extends Partial<Omit<Chat, "id" | "created_at" | "is_group_chat">> {}

export interface ChatParticipant {
  id: UUID;
  chat_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: Date;
  last_read?: Date;
  is_muted: boolean;
}
export interface MessageWithUser {
  id: string;
  content?: string;
  created_at: string;
  sender_id: string;
  users: {
    username: string;
  };
}

export interface ChatParticipantCreate
  extends Omit<ChatParticipant, "id" | "joined_at"> {}

export interface ChatParticipantUpdate
  extends Partial<
    Omit<ChatParticipant, "id" | "chat_id" | "user_id" | "joined_at">
  > {}

export interface ChatSummary {
  id: UUID;
  name?: string;
  is_group_chat: boolean;
  avatar?: string | null;
  last_message?: {
    id: string;
    content?: string;
    sender_name: string;
    created_at: Date;
  };
  unread_count: number;
  participants: {
    id: string;
    username: string;
    profile_picture?: string | null;
  }[];
}
