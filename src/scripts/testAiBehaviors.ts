import { supabaseAdmin } from "../config/supabase";
import { AiBehaviorService } from "../services/simulation/aiBehavior.service";
import { redisService } from "../services/redis.service";
import { FriendshipService } from "../services/friendshipService";
import { ChatService } from "../services/chatService";
import { EnhancedMessageService } from "../services/enhancedMessageService";
import { initializeSocketIO } from "../socketio";
import http from "http";
import { UUID } from "crypto";

async function testBehaviors() {
  console.log("Initializing Socket.IO...");
  const dummyServer = http.createServer();
  initializeSocketIO(dummyServer);

  console.log("Initializing Redis...");
  redisService.initialize();

  // Wait for Redis connection
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("Fetching users...");
  const { data: humanUsers } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", false)
    .limit(1);

  const { data: aiUsers } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", true)
    .limit(1);

  if (!humanUsers || humanUsers.length === 0 || !aiUsers || aiUsers.length === 0) {
    console.error("Could not find a human and an AI user. Make sure your database is seeded!");
    return;
  }

  const human = humanUsers[0];
  const ai = aiUsers[0];
  console.log(`Using human user: @${human.username} (${human.id})`);
  console.log(`Using AI user: @${ai.username} (${ai.id})`);

  // Get current persona identity timezone
  const { data: originalPersona } = await supabaseAdmin!
    .from("persona_identities")
    .select("timezone")
    .eq("user_id", ai.id)
    .single();

  const originalTimezone = originalPersona?.timezone || "EST";
  console.log(`Original timezone of AI: ${originalTimezone}. Setting temporarily to AEST to force awake...`);
  
  await supabaseAdmin!
    .from("persona_identities")
    .update({ timezone: "AEST" })
    .eq("user_id", ai.id);

  // Clean old chats
  console.log("Cleaning old chats and messages between them...");
  const { data: humanChats } = await supabaseAdmin!
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", human.id);

  if (humanChats) {
    for (const c of humanChats) {
      const { data: parts } = await supabaseAdmin!
        .from("chat_participants")
        .select("user_id")
        .eq("chat_id", c.chat_id);
      if (parts && parts.length === 2 && parts.some(p => p.user_id === ai.id)) {
        console.log(`Cleaning old chat ${c.chat_id}...`);
        await supabaseAdmin!.from("messages").delete().eq("chat_id", c.chat_id);
        await supabaseAdmin!.from("chat_participants").delete().eq("chat_id", c.chat_id);
        await supabaseAdmin!.from("chats").delete().eq("id", c.chat_id);
      }
    }
  }

  try {
    // --- 1. Test Inbound Friend Request ---
    console.log("\n--- Testing Inbound Friend Request Auto-Accept ---");
    // Clean existing friendship
    await supabaseAdmin!
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${human.id},addressee_id.eq.${ai.id}),and(requester_id.eq.${ai.id},addressee_id.eq.${human.id})`);

    console.log(`Sending friend request from human @${human.username} to AI @${ai.username}...`);
    await FriendshipService.sendFriendRequest(human.id, ai.id);

    console.log("Calling autoAcceptFriendRequests...");
    await AiBehaviorService.autoAcceptFriendRequests();

    // Verify friendship accepted
    const friendship = await FriendshipService.getFriendshipBetweenUsers(human.id, ai.id);
    console.log("Friendship status after accept:", friendship?.status);

    // --- 2. Test AI DM Response ---
    console.log("\n--- Testing Direct Message Response ---");
    // Create chat
    const chatRes = await ChatService.createChat({
      context_type: "direct",
      creator_id: human.id as UUID,
      is_group_chat: false
    }, [ai.id]);

    const chatId = chatRes.chat.id;
    console.log(`Chat ID: ${chatId}`);

    // Send message as human
    console.log(`Sending message: 'hello, how are you?' as @${human.username}...`);
    await EnhancedMessageService.createMessage({
      chat_id: chatId,
      sender_id: human.id as UUID,
      content: "hello, how are you?",
      is_read: false
    } as any);

    console.log("Running processUnreadDMs...");
    await AiBehaviorService.processUnreadDMs();

    console.log("Wait for AI to reply (includes typing delay simulation)...");
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Check messages
    const { data: messages } = await supabaseAdmin!
      .from("messages")
      .select("id, content, sender_id, prompt_tokens, completion_tokens, estimated_cost_usd")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    console.log("Messages in chat:");
    console.log(JSON.stringify(messages, null, 2));

  } finally {
    console.log(`Restoring timezone to ${originalTimezone}...`);
    await supabaseAdmin!
      .from("persona_identities")
      .update({ timezone: originalTimezone })
      .eq("user_id", ai.id);
  }

  console.log("Behaviors test complete!");
}

testBehaviors().then(() => process.exit(0)).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
