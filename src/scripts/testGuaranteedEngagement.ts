import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { PostService } from "../services/postService";
import { FriendshipService } from "../services/friendshipService";
import { SimulationEngine } from "../services/simulation/simulationEngine";
import { PostVisibility } from "../models/post.model";
import { FriendshipStatus } from "../models/friendship.model";
import { UUID } from "crypto";

async function main() {
  logger.info("--- Starting Guaranteed AI Engagement Test ---");

  // Initialize Socket.IO with a dummy HttpServer to prevent CLI test failure on notifications
  try {
    const http = require("http");
    const { initializeSocketIO } = require("../socketio");
    const server = http.createServer();
    initializeSocketIO(server);
    logger.info("Initialized dummy Socket.IO server for CLI test context.");
  } catch (err: any) {
    logger.warn(`Failed to initialize dummy socket server: ${err.message}`);
  }

  // Initialize Behavior Planner event listeners
  try {
    const { BehaviorPlannerService } = require("../services/simulation/behaviorPlanner.service");
    BehaviorPlannerService.init();
    logger.info("Initialized BehaviorPlanner event listeners.");
  } catch (err: any) {
    logger.error(`Failed to initialize behavior planner listeners: ${err.message}`);
  }

  // 1. Fetch or create a human user
  const { data: humanUser, error: humanErr } = await supabaseAdmin!
    .from("users")
    .select("id, email")
    .eq("is_ai", false)
    .limit(1)
    .maybeSingle();

  if (humanErr || !humanUser) {
    logger.error("Failed to find a human user in database. Make sure you have human users registered.");
    process.exit(1);
  }

  logger.info(`Using human user ID: ${humanUser.id} (${humanUser.email})`);

  // Clear any existing behavior jobs to avoid confusion
  logger.info("Clearing any existing behavior jobs in pending/processing...");
  await supabaseAdmin!
    .from("behavior_jobs")
    .delete()
    .in("status", ["pending", "processing"]);

  // Clear any pending/existing friendship between any AI and the human so we can guarantee a new request is sent
  logger.info("Deleting existing friendships for this human to ensure request can be sent...");
  await supabaseAdmin!
    .from("friendships")
    .delete()
    .or(`requester_id.eq.${humanUser.id},addressee_id.eq.${humanUser.id}`);

  // 2. Create a human user post
  logger.info("Creating a new post as the human user...");
  const post = await PostService.createPost({
    user_id: humanUser.id as UUID,
    content: "Just built a new feature on my local server! Is anyone else coding today?",
    visibility: PostVisibility.PUBLIC,
    is_ai_generated: false
  });

  logger.info(`Post created successfully! ID: ${post.id}`);

  // 3. Poll and wait for both COMMENT and FRIEND_REQUEST behavior jobs to be scheduled (up to 30 seconds)
  logger.info("Polling for scheduled post engagement jobs...");
  let commentJob = null;
  let friendRequestJob = null;

  for (let i = 0; i < 60; i++) {
    const { data: jobs } = await supabaseAdmin!
      .from("behavior_jobs")
      .select("id, action_type, run_at, status, persona_id, persona_identities(username, user_id)")
      .eq("status", "pending");

    commentJob = jobs?.find(j => j.action_type === "COMMENT") || null;
    friendRequestJob = jobs?.find(j => j.action_type === "FRIEND_REQUEST") || null;

    if (commentJob && friendRequestJob) {
      logger.info("Both jobs found!");
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!commentJob) {
    logger.error("❌ FAILED: Guaranteed COMMENT job was not scheduled.");
    process.exit(1);
  }

  if (!friendRequestJob) {
    logger.error("❌ FAILED: Guaranteed FRIEND_REQUEST job was not scheduled.");
    process.exit(1);
  }

  logger.info("✅ SUCCESS: Both COMMENT and FRIEND_REQUEST jobs are successfully scheduled!");

  // 4. Fast-forward and execute the COMMENT job
  logger.info("Fast-forwarding and executing COMMENT job...");
  await supabaseAdmin!
    .from("behavior_jobs")
    .update({ run_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", commentJob.id);

  await SimulationEngine.processBehaviorQueue();

  // Check if comment was successfully created
  const { data: comments, error: commentCheckErr } = await supabaseAdmin!
    .from("comments")
    .select("id, content, user_id, is_ai_generated")
    .eq("post_id", post.id);

  if (commentCheckErr || !comments || comments.length === 0) {
    logger.error(`❌ FAILED: Comment was not posted. Error: ${commentCheckErr?.message}`);
    process.exit(1);
  }

  logger.info(`✅ SUCCESS: Comment posted: "${comments[0].content}" by user ${comments[0].user_id}`);

  // 5. Fast-forward and execute the FRIEND_REQUEST job
  logger.info("Fast-forwarding and executing FRIEND_REQUEST job...");
  await supabaseAdmin!
    .from("behavior_jobs")
    .update({ run_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", friendRequestJob.id);

  await SimulationEngine.processBehaviorQueue();

  // Check if friend request was successfully sent
  const personaUserId = (friendRequestJob.persona_identities as any).user_id;
  const { data: friendship, error: friendshipCheckErr } = await supabaseAdmin!
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(`and(requester_id.eq.${personaUserId},addressee_id.eq.${humanUser.id}),and(requester_id.eq.${humanUser.id},addressee_id.eq.${personaUserId})`)
    .maybeSingle();

  if (friendshipCheckErr || !friendship) {
    logger.error(`❌ FAILED: Friend request was not sent. Error: ${friendshipCheckErr?.message}`);
    process.exit(1);
  }

  logger.info(`✅ SUCCESS: Friend request status: ${friendship.status} (requester: ${friendship.requester_id}, addressee: ${friendship.addressee_id})`);

  // 6. Accept the friend request
  logger.info("Simulating human accepting the friend request...");
  await FriendshipService.updateFriendshipStatus(friendship.id, FriendshipStatus.ACCEPTED);

  // 7. Check if greeting chat behavior job was scheduled (poll for up to 10 seconds)
  logger.info("Polling for scheduled behavior jobs for greeting message...");
  let greetJob = null;
  for (let i = 0; i < 20; i++) {
    const { data: greetJobs } = await supabaseAdmin!
      .from("behavior_jobs")
      .select("id, action_type, run_at, status, persona_id, payload")
      .eq("status", "pending")
      .in("action_type", ["GREET_SIMPLE", "GREET_PROFILE"]);

    if (greetJobs && greetJobs.length > 0) {
      greetJob = greetJobs[0];
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!greetJob) {
    logger.error("❌ FAILED: GREETING behavior job was not scheduled after accepting friendship.");
    process.exit(1);
  }

  logger.info(`✅ SUCCESS: Greeting job scheduled: ID: ${greetJob.id}, Action: ${greetJob.action_type}, Run At: ${greetJob.run_at}`);
  logger.info(`Job payload: ${JSON.stringify(greetJob.payload)}`);

  // 8. Fast-forward and execute the greeting job
  logger.info("Fast-forwarding and executing greeting job...");
  await supabaseAdmin!
    .from("behavior_jobs")
    .update({ run_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", greetJob.id);

  await SimulationEngine.processBehaviorQueue();

  // Check if chat and message was successfully created
  // Fetch messages in the chat
  const { data: chatParticipants } = await supabaseAdmin!
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", humanUser.id);

  if (!chatParticipants || chatParticipants.length === 0) {
    logger.error("❌ FAILED: No chat was created.");
    process.exit(1);
  }

  const chatIds = chatParticipants.map(cp => cp.chat_id);
  const { data: messages, error: messagesErr } = await supabaseAdmin!
    .from("messages")
    .select("id, content, sender_id, created_at")
    .in("chat_id", chatIds)
    .order("created_at", { ascending: false });

  if (messagesErr || !messages || messages.length === 0) {
    logger.error(`❌ FAILED: No greeting message was sent in any chat. Error: ${messagesErr?.message}`);
    process.exit(1);
  }

  logger.info(`✅ SUCCESS: Greeting message sent in chat: "${messages[0].content}" by sender ${messages[0].sender_id}`);

  // Cleanup to keep database clean and prevent duplicate posts or stale records
  logger.info("Cleaning up test data (post, comments, friend requests, chats) to keep profile clean...");
  try {
    // 1. Delete post
    await supabaseAdmin!.from("posts").delete().eq("id", post.id);
    // 2. Delete feed candidate
    await supabaseAdmin!.from("feed_candidates").delete().eq("reference_id", post.id);
    // 3. Delete any messages from the chats
    await supabaseAdmin!.from("messages").delete().in("chat_id", chatIds);
    // 4. Delete the chats
    await supabaseAdmin!.from("chats").delete().in("id", chatIds);
    // 5. Delete friendships created during test
    await supabaseAdmin!.from("friendships").delete().or(`requester_id.eq.${humanUser.id},addressee_id.eq.${humanUser.id}`);
    logger.info("✅ Cleanup successful!");
  } catch (cleanErr: any) {
    logger.error(`Error during cleanup: ${cleanErr.message}`);
  }

  logger.info("--- Guaranteed AI Engagement Test Finished Successfully! ---");
}

main().then(() => {
  logger.info("Test complete!");
  process.exit(0);
}).catch(err => {
  logger.error("Test error:", err);
  process.exit(1);
});
