// src/sockets/chatHandlers.ts
import { Server, Socket } from "socket.io";
import { ChatEvents, SocketMessage, TypingStatus } from "../types/socket";
import { logger } from "../utils/logger";
import { ChatService } from "../services/message/chatService";
import { UUID } from "crypto";
import { supabase } from "../config/supabase";

// Store typing status
const typingUsers = new Map<string, Set<string>>();

/**
 * Set up chat event handlers for a socket
 */
export function setupChatHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.user?.id;

  if (!userId) {
    logger.warn("Cannot set up chat handlers: Missing user ID");
    return;
  }

  // Handle joining a chat room
  socket.on(ChatEvents.JOIN_CHAT, async (chatId: string) => {
    try {
      // Validate user is a member of the chat
      const chat = await ChatService.getChatById(
        chatId as UUID,
        userId as UUID
      );

      if (!chat) {
        socket.emit(ChatEvents.CHAT_ERROR, {
          event: ChatEvents.JOIN_CHAT,
          message: "Chat not found or you are not a participant",
          code: "CHAT_NOT_FOUND",
        });
        return;
      }

      // Join the chat room
      socket.join(`chat:${chatId}`);
      logger.debug(`User ${userId} joined chat room: ${chatId}`);

      // Initialize typing status map for this chat if needed
      if (!typingUsers.has(chatId)) {
        typingUsers.set(chatId, new Set<string>());
      }
    } catch (error) {
      logger.error(`Error joining chat ${chatId}:`, error);
      socket.emit(ChatEvents.CHAT_ERROR, {
        event: ChatEvents.JOIN_CHAT,
        message: error instanceof Error ? error.message : "Failed to join chat",
        code: "JOIN_CHAT_ERROR",
      });
    }
  });

  // Handle leaving a chat room
  socket.on(ChatEvents.LEAVE_CHAT, (chatId: string) => {
    socket.leave(`chat:${chatId}`);
    logger.debug(`User ${userId} left chat room: ${chatId}`);

    // Remove user from typing status if present
    const typingSet = typingUsers.get(chatId);
    if (typingSet && typingSet.has(userId)) {
      typingSet.delete(userId);
      // Notify others that user stopped typing
      socket.to(`chat:${chatId}`).emit(ChatEvents.TYPING_STOP, {
        chat_id: chatId,
        user_id: userId,
      });
    }
  });

  // Handle sending a message
  socket.on(ChatEvents.SEND_MESSAGE, async (messageData: SocketMessage) => {
    try {
      // Validate the message data
      if (!messageData.chat_id) {
        socket.emit(ChatEvents.CHAT_ERROR, {
          event: ChatEvents.SEND_MESSAGE,
          message: "Chat ID is required",
          code: "INVALID_MESSAGE",
        });
        return;
      }

      // Make sure sender ID matches socket user
      const senderId = userId as UUID;
      messageData.sender_id = senderId;

      // Remove user from typing status
      const typingSet = typingUsers.get(messageData.chat_id.toString());
      if (typingSet && typingSet.has(userId)) {
        typingSet.delete(userId);
        // Notify others that user stopped typing
        socket.to(`chat:${messageData.chat_id}`).emit(ChatEvents.TYPING_STOP, {
          chat_id: messageData.chat_id,
          user_id: userId,
        });
      }

      // Send message to database
      const message = await ChatService.sendMessage(messageData);

      // Broadcast to everyone in the chat room including sender
      io.to(`chat:${messageData.chat_id}`).emit(
        ChatEvents.RECEIVE_MESSAGE,
        message
      );

      // Also send to each participant's personal room for notification purposes
      const chat = await ChatService.getChatById(
        messageData.chat_id as UUID,
        senderId
      );
      const participants = chat.chat_participants || [];

      participants.forEach((participant: any) => {
        const participantId = participant.user_id;
        // Skip the sender
        if (participantId !== userId) {
          io.to(`user:${participantId}`).emit(
            ChatEvents.RECEIVE_MESSAGE,
            message
          );
        }
      });
    } catch (error) {
      logger.error("Error sending message:", error);
      socket.emit(ChatEvents.CHAT_ERROR, {
        event: ChatEvents.SEND_MESSAGE,
        message:
          error instanceof Error ? error.message : "Failed to send message",
        code: "SEND_MESSAGE_ERROR",
      });
    }
  });

  // Handle message read status
  socket.on(ChatEvents.MESSAGE_READ, async (messageId: string) => {
    try {
      await ChatService.markMessageAsRead(messageId as UUID, userId as UUID);

      // Get message to broadcast to relevant rooms
      const { data: message } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (message) {
        // Broadcast to chat room
        io.to(`chat:${message.chat_id}`).emit(ChatEvents.MESSAGE_READ, {
          message_id: messageId,
          chat_id: message.chat_id,
          user_id: userId,
        });
      }
    } catch (error) {
      logger.error(`Error marking message ${messageId} as read:`, error);
      socket.emit(ChatEvents.CHAT_ERROR, {
        event: ChatEvents.MESSAGE_READ,
        message:
          error instanceof Error
            ? error.message
            : "Failed to mark message as read",
        code: "MESSAGE_READ_ERROR",
      });
    }
  });

  // Handle deleting a message
  socket.on(ChatEvents.DELETE_MESSAGE, async (messageId: string) => {
    try {
      // Get message details before deletion for broadcast
      const { data: message } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .single();

      if (!message) {
        throw new Error("Message not found");
      }

      // Only allow sender to delete
      if (message.sender_id !== userId) {
        throw new Error("You can only delete your own messages");
      }

      await ChatService.deleteMessage(messageId as UUID, userId as UUID);

      // Broadcast deletion to chat room
      io.to(`chat:${message.chat_id}`).emit(ChatEvents.MESSAGE_DELETED, {
        message_id: messageId,
        chat_id: message.chat_id,
      });
    } catch (error) {
      logger.error(`Error deleting message ${messageId}:`, error);
      socket.emit(ChatEvents.CHAT_ERROR, {
        event: ChatEvents.DELETE_MESSAGE,
        message:
          error instanceof Error ? error.message : "Failed to delete message",
        code: "DELETE_MESSAGE_ERROR",
      });
    }
  });

  // Handle typing indicators
  socket.on(ChatEvents.TYPING_START, (data: TypingStatus) => {
    // Get chat ID from data
    const chatId = data.chat_id.toString();

    // Initialize typing set for this chat if needed
    if (!typingUsers.has(chatId)) {
      typingUsers.set(chatId, new Set<string>());
    }

    // Add user to typing set
    typingUsers.get(chatId)?.add(userId);

    // Broadcast to others in the chat
    socket.to(`chat:${chatId}`).emit(ChatEvents.TYPING_START, {
      chat_id: chatId,
      user_id: userId,
    });
  });

  socket.on(ChatEvents.TYPING_STOP, (data: TypingStatus) => {
    // Get chat ID from data
    const chatId = data.chat_id.toString();

    // Remove user from typing set
    typingUsers.get(chatId)?.delete(userId);

    // Broadcast to others in the chat
    socket.to(`chat:${chatId}`).emit(ChatEvents.TYPING_STOP, {
      chat_id: chatId,
      user_id: userId,
    });
  });
}
