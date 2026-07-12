// src/scripts/testChatNotification.ts
import { supabaseAdmin } from "../config/supabase";
import jwt from "jsonwebtoken";
import axios from "axios";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

async function run() {
  console.log("--- STARTING CHAT NOTIFICATION TEST ---");

  // 1. Fetch target human user
  const targetUsername = process.argv[2];
  let human;

  if (targetUsername) {
    const { data: foundUser, error: findErr } = await supabaseAdmin!
      .from("users")
      .select("id, username, email, role")
      .eq("username", targetUsername)
      .eq("is_ai", false)
      .maybeSingle();

    if (findErr || !foundUser) {
      console.error(`Failed to find active human user with username "${targetUsername}":`, findErr);
      process.exit(1);
    }
    human = foundUser;
  } else {
    const { data: humans, error: humanErr } = await supabaseAdmin!
      .from("users")
      .select("id, username, email, role")
      .eq("is_ai", false)
      .limit(1);

    if (humanErr || !humans || humans.length === 0) {
      console.error("Failed to fetch human users:", humanErr);
      process.exit(1);
    }
    human = humans[0];
  }

  // 2. Fetch first AI user
  const { data: ais, error: aiErr } = await supabaseAdmin!
    .from("users")
    .select("id, username, email, role")
    .eq("is_ai", true)
    .limit(1);

  if (aiErr || !ais || ais.length === 0) {
    console.error("Failed to fetch AI users:", aiErr);
    process.exit(1);
  }
  const ai = ais[0];

  console.log(`Target Human User: @${human.username} (${human.id})`);
  console.log(`Sender AI User:    @${ai.username} (${ai.id})`);

  // 3. Find or create a direct chat between them
  let chatId = null;

  // Let's check for an existing direct chat
  const { data: participants } = await supabaseAdmin!
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", human.id);

  if (participants) {
    for (const p of participants) {
      const { data: parts } = await supabaseAdmin!
        .from("chat_participants")
        .select("user_id")
        .eq("chat_id", p.chat_id);
      if (parts && parts.length === 2 && parts.some(item => item.user_id === ai.id)) {
        chatId = p.chat_id;
        break;
      }
    }
  }

  if (chatId) {
    console.log(`Found existing direct chat: ${chatId}`);
  } else {
    console.log("No existing direct chat found. Creating one...");
    const { data: newChat, error: newChatErr } = await supabaseAdmin!
      .from("chats")
      .insert({
        context_type: "direct",
        creator_id: ai.id,
        is_group_chat: false
      })
      .select()
      .single();

    if (newChatErr || !newChat) {
      console.error("Failed to create chat:", newChatErr);
      process.exit(1);
    }

    chatId = newChat.id;

    // Add participants
    const { error: partErr } = await supabaseAdmin!
      .from("chat_participants")
      .insert([
        { chat_id: chatId, user_id: human.id },
        { chat_id: chatId, user_id: ai.id }
      ]);

    if (partErr) {
      console.error("Failed to add chat participants:", partErr);
      process.exit(1);
    }
    console.log(`Created new direct chat: ${chatId}`);
  }

  // 4. Generate JWT for the AI user
  const token = jwt.sign(
    {
      id: ai.id,
      email: ai.email,
      role: ai.role,
    },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1d" }
  );

  const messageText = `Hey there! This is a test notification message sent at ${new Date().toLocaleTimeString()}. Did you see the chat badge update?`;

  console.log(`\nSending message: "${messageText}"`);

  // 5. POST to /api/v1/messages on the running server
  try {
    const response = await axios.post(
      "http://127.0.0.1:5000/api/v1/messages",
      {
        chatId,
        content: messageText,
        recipientId: human.id
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    console.log("Response status:", response.status);
    console.log("Message created successfully!");
    console.log("\n✅ Test complete. If you are logged in as this user on the browser, the unread count badge on the 'Chat' menu should now show or increment.");
  } catch (err: any) {
    console.error("Failed to send message via API:", err.response?.data || err.message);
    process.exit(1);
  }
}

run().then(() => process.exit(0));
