import { UUID } from "crypto";
import { MemberRole } from "./group-page.model";

export interface Chat {
  id: UUID;
  created_at: Date;
  is_group_chat: boolean;
  name?: string; // For group chats
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
}

export interface ChatParticipantCreate
  extends Omit<ChatParticipant, "id" | "joined_at"> {}

export interface ChatParticipantUpdate
  extends Partial<
    Omit<ChatParticipant, "id" | "chat_id" | "user_id" | "joined_at">
  > {}

export interface Message {
  id: UUID;
  chat_id: UUID;
  sender_id: UUID;
  content?: string;
  media?: string[]; // Array of media URLs
  is_read: boolean;
  created_at: Date;
  auto_delete_at?: Date;
  is_deleted: boolean;
}

export interface MessageCreate
  extends Omit<Message, "id" | "created_at" | "is_read" | "is_deleted"> {
  is_read?: boolean;
}

export interface MessageUpdate
  extends Partial<
    Omit<Message, "id" | "chat_id" | "sender_id" | "created_at">
  > {}

export interface ChatSummary {
  id: UUID;
  name?: string;
  is_group_chat: boolean;
  last_message?: {
    content: string;
    sender_name: string;
    created_at: Date;
  };
  unread_count: number;
  participants: {
    id: UUID;
    username: string;
    profile_picture?: string;
  }[];
}
