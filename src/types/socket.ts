// src/types/socket.ts
import { Socket } from "socket.io";
import { UUID } from "crypto";

// Chat events enum
export enum ChatEvents {
  // Connection events
  JOIN_CHAT = "join_chat",
  LEAVE_CHAT = "leave_chat",

  // Message events
  SEND_MESSAGE = "send_message",
  RECEIVE_MESSAGE = "receive_message",
  UPDATE_MESSAGE = "update_message",
  DELETE_MESSAGE = "delete_message",
  MESSAGE_DELETED = "message_deleted",

  // Status events
  MESSAGE_READ = "message_read",
  TYPING_START = "typing_start",
  TYPING_STOP = "typing_stop",

  // Error events
  CHAT_ERROR = "chat_error",
}

// User status events enum
export enum UserStatusEvents {
  USER_ONLINE = "user_online",
  USER_OFFLINE = "user_offline",
  SET_STATUS = "set_status",
  GET_ONLINE_USERS = "get_online_users",
}

// Message interface
export interface SocketMessage {
  id?: UUID;
  chat_id: UUID;
  sender_id: UUID;
  content?: string;
  media?: SocketMedia[];
  created_at?: string;
  is_read?: boolean;
  auto_delete_at?: string;
}

// Media interface
export interface SocketMedia {
  url: string;
  type: string;
  name?: string;
  size?: number;
}

// Typing status interface
export interface TypingStatus {
  chat_id: UUID;
  user_id: UUID;
  is_typing: boolean;
}

// Chat socket interface with typed handlers
export interface ChatSocket extends Socket {
  data: {
    user: {
      id: string;
      email: string;
      role: string;
    };
  };
}

// Error response interface
export interface SocketErrorResponse {
  event: string;
  message: string;
  code: string;
}
