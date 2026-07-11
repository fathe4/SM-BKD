import { config } from "dotenv";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

config();

async function runSeeder() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized. Check your environment variables.");
    process.exit(1);
  }

  logger.info("--- Starting NPC Simulation Seeding & Migration Script ---");

  // 1. Seed Archetypes
  logger.info("Step 1: Seeding Default Archetypes...");
  const archetypes = [
    {
      name: "Marketing & Growth Marketer",
      base_personality: {
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.8,
        agreeableness: 0.6,
        neuroticism: 0.3
      },
      base_style: {
        capitalization: "standard",
        slangUsage: true,
        technicalDepth: 0.6
      },
      base_goals: ["become_respected", "grow_followers"]
    },
    {
      name: "AI Researcher / Developer",
      base_personality: {
        openness: 0.9,
        conscientiousness: 0.8,
        extraversion: 0.4,
        agreeableness: 0.7,
        neuroticism: 0.2
      },
      base_style: {
        capitalization: "standard",
        slangUsage: false,
        technicalDepth: 0.9
      },
      base_goals: ["become_respected", "promote_startup"]
    },
    {
      name: "UI/UX Product Designer",
      base_personality: {
        openness: 0.95,
        conscientiousness: 0.7,
        extraversion: 0.6,
        agreeableness: 0.8,
        neuroticism: 0.4
      },
      base_style: {
        capitalization: "standard",
        slangUsage: true,
        technicalDepth: 0.7
      },
      base_goals: ["become_respected", "share_memes"]
    }
  ];

  const archetypeIds: Record<string, string> = {};

  for (const arch of archetypes) {
    // Check if archetype exists
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("persona_archetypes")
      .select("id")
      .eq("name", arch.name)
      .maybeSingle();

    if (fetchErr) {
      logger.error(`Error querying archetype ${arch.name}:`, fetchErr);
      throw fetchErr;
    }

    if (existing) {
      logger.info(`Archetype "${arch.name}" already exists.`);
      archetypeIds[arch.name] = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("persona_archetypes")
        .insert(arch)
        .select("id")
        .single();

      if (insertErr) {
        logger.error(`Error inserting archetype ${arch.name}:`, insertErr);
        throw insertErr;
      }
      logger.info(`Seeded archetype "${arch.name}"`);
      archetypeIds[arch.name] = inserted.id;
    }
  }

  // 2. Fetch Existing AI Personas to migrate
  logger.info("Step 2: Fetching existing AI personas...");
  const { data: oldPersonas, error: oldErr } = await supabaseAdmin
    .from("ai_personas")
    .select("*, users(username, first_name, last_name, bio)");

  if (oldErr) {
    logger.error("Error querying existing ai_personas table:", oldErr);
    throw oldErr;
  }

  logger.info(`Found ${oldPersonas?.length || 0} personas to migrate.`);

  // 3. Seed Entities (Topics/Keywords)
  logger.info("Step 3: Seeding default entities...");
  const defaultEntities = [
    { name: "Artificial Intelligence", entity_type: "topic", description: "All things LLMs, machine learning, and AI future." },
    { name: "Design & Typography", entity_type: "topic", description: "UI/UX, visual craft, design patterns, and branding." },
    { name: "Growth Marketing", entity_type: "topic", description: "B2B growth, analytics, conversion rates, and scaling channels." },
    { name: "Open Source Software", entity_type: "topic", description: "GitHub projects, collaboration, code architecture, and tooling." }
  ];

  const entityIds: Record<string, string> = {};

  for (const ent of defaultEntities) {
    const { data: existing, error: entFetchErr } = await supabaseAdmin
      .from("entities")
      .select("id")
      .eq("name", ent.name)
      .maybeSingle();

    if (entFetchErr) {
      logger.error(`Error querying entity ${ent.name}:`, entFetchErr);
      throw entFetchErr;
    }

    if (existing) {
      entityIds[ent.name] = existing.id;
    } else {
      const { data: inserted, error: entInsertErr } = await supabaseAdmin
        .from("entities")
        .insert(ent)
        .select("id")
        .single();

      if (entInsertErr) {
        logger.error(`Error inserting entity ${ent.name}:`, entInsertErr);
        throw entInsertErr;
      }
      logger.info(`Seeded entity: ${ent.name}`);
      entityIds[ent.name] = inserted.id;
    }
  }

  // 4. Migrate and Seed Profiles
  logger.info("Step 4: Migrating and seeding identities, states, profiles, and interests...");
  for (const oldP of (oldPersonas || [])) {
    const userId = oldP.user_id;
    const category = oldP.category; // e.g. "Marketing & Growth", "Technology & AI Future", "Design & UI/UX"
    
    // Choose appropriate archetype
    let archName = "AI Researcher / Developer";
    if (category.toLowerCase().includes("market")) {
      archName = "Marketing & Growth Marketer";
    } else if (category.toLowerCase().includes("design")) {
      archName = "UI/UX Product Designer";
    }

    const archetypeId = archetypeIds[archName];

    // Check if identity already exists
    const { data: existingIdentity, error: identErr } = await supabaseAdmin
      .from("persona_identities")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (identErr) {
      logger.error(`Error checking identity for user ${userId}:`, identErr);
      throw identErr;
    }

    let identityId = "";

    if (existingIdentity) {
      logger.info(`Identity already exists for user ${oldP.users?.username || userId}.`);
      identityId = existingIdentity.id;
    } else {
      // Insert identity
      const profession = category.replace(" & ", " & ");
      const { data: insertedIdentity, error: insertIdErr } = await supabaseAdmin
        .from("persona_identities")
        .insert({
          user_id: userId,
          archetype_id: archetypeId,
          username: oldP.users?.username || `ai_user_${userId.slice(0, 4)}`,
          profession: profession,
          age: Math.floor(Math.random() * 15) + 24, // 24-39
          country: "United States",
          timezone: "EST",
          education: "B.S. Computer Science / Design / Business",
          personality_json: archetypes.find(a => a.name === archName)?.base_personality || {},
          writing_style: archetypes.find(a => a.name === archName)?.base_style || {},
          humor: archName.includes("Designer") ? 0.6 : 0.4,
          political_bias: 0.0,
          attention_span: 0.7,
          curiosity: 0.8,
          confidence: 0.75
        })
        .select("id")
        .single();

      if (insertIdErr) {
        logger.error(`Error inserting identity for user ${userId}:`, insertIdErr);
        throw insertIdErr;
      }
      logger.info(`Created persona identity for: ${oldP.users?.username || userId}`);
      identityId = insertedIdentity.id;
    }

    // Upsert Persona States
    const { error: stateErr } = await supabaseAdmin
      .from("persona_states")
      .upsert({
        persona_id: identityId,
        valence: 0.5,
        arousal: 0.5,
        energy: 1.0,
        today_post_count: 0,
        today_comment_count: 0
      });

    if (stateErr) {
      logger.error(`Error upserting state for persona ${identityId}:`, stateErr);
      throw stateErr;
    }

    // Upsert Conversation Profiles
    const { error: convErr } = await supabaseAdmin
      .from("persona_conversation_profiles")
      .upsert({
        persona_id: identityId,
        conversation_role: archName.includes("Researcher") ? "teacher" : archName.includes("Designer") ? "mentor" : "observer",
        avg_response_delay_minutes: 15,
        max_comments_per_thread: 2,
        reply_probability: 0.3,
        question_probability: 0.2,
        disagreement_probability: 0.15,
        encouragement_probability: 0.4,
        humor_probability: 0.15,
        emoji_probability: 0.1,
        thread_depth_limit: 3,
        duplicate_tolerance: 0.2,
        interruption_tolerance: 0.3
      });

    if (convErr) {
      logger.error(`Error upserting conversation profile for persona ${identityId}:`, convErr);
      throw convErr;
    }

    // Upsert Social Goals
    const goalTypes = archName.includes("Marketer") ? ["grow_followers", "become_respected"] : ["become_respected"];
    for (const gt of goalTypes) {
      const { error: goalErr } = await supabaseAdmin
        .from("persona_social_goals")
        .upsert({
          persona_id: identityId,
          goal_type: gt,
          priority: 0.8,
          progress: 0.1
        }, { onConflict: "persona_id, goal_type" });

      if (goalErr) {
        logger.error(`Error upserting goal ${gt} for persona ${identityId}:`, goalErr);
        throw goalErr;
      }
    }

    // Upsert Reputations
    const { error: repErr } = await supabaseAdmin
      .from("persona_reputations")
      .upsert({
        persona_id: identityId,
        technical_credibility: archName.includes("Researcher") ? 0.9 : 0.6,
        humor: 0.5,
        kindness: 0.8,
        toxicity: 0.05,
        helpfulness: 0.8
      });

    if (repErr) {
      logger.error(`Error upserting reputation for persona ${identityId}:`, repErr);
      throw repErr;
    }

    // Seed interests and expertise weights based on persona role
    logger.info(`Seeding interests/expertise for: ${oldP.users?.username || userId}`);
    for (const [entName, entId] of Object.entries(entityIds)) {
      let interestWeight = 0.2;
      let knowledgeScore = 0.1;

      if (archName.includes("Researcher")) {
        if (entName === "Artificial Intelligence") {
          interestWeight = 0.95;
          knowledgeScore = 0.9;
        } else if (entName === "Open Source Software") {
          interestWeight = 0.8;
          knowledgeScore = 0.75;
        }
      } else if (archName.includes("Designer")) {
        if (entName === "Design & Typography") {
          interestWeight = 0.95;
          knowledgeScore = 0.85;
        } else if (entName === "Open Source Software") {
          interestWeight = 0.5;
          knowledgeScore = 0.4;
        }
      } else if (archName.includes("Marketer")) {
        if (entName === "Growth Marketing") {
          interestWeight = 0.95;
          knowledgeScore = 0.8;
        } else if (entName === "Artificial Intelligence") {
          interestWeight = 0.6;
          knowledgeScore = 0.4;
        }
      }

      // Upsert persona_interests
      const { error: intErr } = await supabaseAdmin
        .from("persona_interests")
        .upsert({
          persona_id: identityId,
          topic_entity_id: entId,
          weight: interestWeight
        }, { onConflict: "persona_id, topic_entity_id" });

      if (intErr) {
        logger.error(`Error upserting interest ${entName} for persona ${identityId}:`, intErr);
        throw intErr;
      }

      // Upsert persona_expertise
      const { error: expErr } = await supabaseAdmin
        .from("persona_expertise")
        .upsert({
          persona_id: identityId,
          topic_entity_id: entId,
          knowledge_score: knowledgeScore
        }, { onConflict: "persona_id, topic_entity_id" });

      if (expErr) {
        logger.error(`Error upserting expertise ${entName} for persona ${identityId}:`, expErr);
        throw expErr;
      }
    }
  }

  logger.info("--- Seeding and Migration Completed Successfully! ---");
}

runSeeder().catch((e) => {
  logger.error("Seeder execution failed:", e);
  process.exit(1);
});
