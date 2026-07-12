import { config } from "dotenv";
import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

config();

const femaleNames = new Set([
  "Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Mia", "Isabella", "Ava", "Evelyn", "Luna",
  "Harper", "Sofia", "Camila", "Eleanor", "Elizabeth", "Violet", "Emily", "Hazel", "Aurora", "Gianna",
  "Aria", "Avery", "Lily", "Ella", "Abigail", "Adeline", "Alice", "Elena", "Chloe",
  "Grace", "Isla", "Zoe", "Nora", "Iris", "Stella", "Lucy", "Maya", "Natalie", "Emilia",
  "Victoria", "Aubrey", "Bella", "Skyler", "Zuri", "Clara", "Nova", "Ayla"
]);

const firstNames = [
  "Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry", "Lucas", "Benjamin", "Theodore",
  "Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Mia", "Isabella", "Ava", "Evelyn", "Luna",
  "Alexander", "Daniel", "Michael", "Ethan", "Jackson", "Sebastian", "Jack", "Aiden", "Owen", "Samuel",
  "Harper", "Sofia", "Camila", "Eleanor", "Elizabeth", "Violet", "Emily", "Hazel", "Aurora", "Gianna",
  "Matthew", "Joseph", "Levi", "Mateo", "David", "John", "Wyatt", "Carter", "Julian", "Luke",
  "Aria", "Avery", "Lily", "Ella", "Evelyn", "Abigail", "Adeline", "Alice", "Elena", "Chloe",
  "Grayson", "Isaac", "Jayden", "Dylan", "Gabriel", "Lincoln", "Hudson", "Ezra", "Thomas",
  "Grace", "Isla", "Zoe", "Nora", "Iris", "Stella", "Lucy", "Maya", "Natalie", "Emilia",
  "Charles", "Christopher", "Miles", "Leo", "Isaiah", "Andrew", "Joshua", "Nathan", "Nolan", "Adrian",
  "Victoria", "Aubrey", "Bella", "Skyler", "Zuri", "Clara", "Nova", "Ayla"
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"
];

const categories = [
  "Technology & AI Future",
  "Design & UI/UX",
  "Marketing & Growth"
];

const tones = [
  "enthusiastic",
  "analytical",
  "funny",
  "supportive",
  "thoughtful",
  "curious",
  "helpful"
];

const countries = ["United States", "United Kingdom", "Canada", "Germany", "Australia", "Singapore", "Netherlands"];
const timezones = ["EST", "PST", "GMT", "CET", "AEST", "SGT"];
const educations = [
  "B.S. Computer Science",
  "B.A. Graphic Design",
  "B.B.A. Growth Marketing & Analytics",
  "M.S. Software Engineering",
  "BFA Visual Communication"
];

const professionsMap: Record<string, string[]> = {
  "Technology & AI Future": [
    "Software Engineer",
    "AI Product Manager",
    "Systems Architect",
    "Open Source Contributor",
    "Tech Lead"
  ],
  "Design & UI/UX": [
    "Product Designer",
    "UI Architect",
    "Creative Director",
    "Brand Designer",
    "UX Researcher"
  ],
  "Marketing & Growth": [
    "Growth Lead",
    "B2B Growth Marketer",
    "Performance Marketing Specialist",
    "SEO Manager",
    "Content Strategist"
  ]
};

async function seedPersonas() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  logger.info("Starting Seeder for 97 active human-like personas...");

  let femaleCount = 1;
  let maleCount = 1;

  // 1. Fetch existing archetypes
  const { data: archetypes, error: archErr } = await supabaseAdmin
    .from("persona_archetypes")
    .select("id, name");

  if (archErr || !archetypes || archetypes.length === 0) {
    logger.error("Failed to fetch persona archetypes. Ensure migrations run first.", archErr);
    process.exit(1);
  }

  // 2. Fetch existing entities
  const { data: entities, error: entErr } = await supabaseAdmin
    .from("entities")
    .select("id, name");

  if (entErr || !entities || entities.length === 0) {
    logger.error("Failed to fetch default entities. Ensure migrations run first.", entErr);
    process.exit(1);
  }

  // Generate 97 unique name combinations
  const nameSet = new Set<string>();
  const personasData: Array<{ firstName: string; lastName: string; username: string }> = [];

  while (personasData.length < 97) {
    const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${fName} ${lName}`;

    if (!nameSet.has(fullName)) {
      nameSet.add(fullName);
      // Generate clean username
      const username = `${fName.toLowerCase()}_${lName.toLowerCase()}_${Math.floor(Math.random() * 900) + 100}`;
      personasData.push({
        firstName: fName,
        lastName: lName,
        username
      });
    }
  }

  logger.info(`Generated ${personasData.length} unique human name/username profiles. Inserting...`);

  // Placeholder password hash for "password123"
  const passwordHash = "$2a$10$Efy7.J8G2uGg5U0H2Nf.Oe8.5vC8yU/dIef9XhN7Z1lUfW46hG6y6";

  let createdCount = 0;

  for (let i = 0; i < personasData.length; i++) {
    const p = personasData[i];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const tone = tones[Math.floor(Math.random() * tones.length)];
    
    // Pick matching archetype
    let archName = "AI Researcher / Developer";
    if (category.includes("Marketing")) {
      archName = "Marketing & Growth Marketer";
    } else if (category.includes("Design")) {
      archName = "UI/UX Product Designer";
    }
    const archetype = archetypes.find(a => a.name === archName) || archetypes[0];

    try {
      // Step A: Create User
      const email = `${p.username}@socialnet.com`;
      const profilePicture = `https://randomuser.me/api/portraits/men/${maleCount}.jpg`;
      maleCount = (maleCount % 99) + 1;

      const { data: user, error: userErr } = await supabaseAdmin
        .from("users")
        .insert({
          email,
          password_hash: passwordHash,
          first_name: p.firstName,
          last_name: p.lastName,
          username: p.username,
          is_ai: true,
          bio: `Passionate about ${category.toLowerCase()}. Sharing thoughts, learnings, and cool resources!`,
          is_verified: Math.random() < 0.2,
          profile_picture: profilePicture
        })
        .select("id")
        .single();

      if (userErr) {
        logger.error(`Error creating user ${p.username}: ${userErr.message}`);
        continue;
      }

      const userId = user.id;

      // Step B: Create AI Persona
      const { data: aiPersona, error: aiErr } = await supabaseAdmin
        .from("ai_personas")
        .insert({
          user_id: userId,
          category,
          tone,
          posting_frequency: Math.floor(Math.random() * 3) + 1, // 1 to 3
          is_active: true
        })
        .select("id")
        .single();

      if (aiErr) {
        logger.error(`Error creating ai_persona for ${p.username}: ${aiErr.message}`);
        continue;
      }

      // Step C: Create Persona Identity
      const professions = professionsMap[category] || ["Professional"];
      const profession = professions[Math.floor(Math.random() * professions.length)];
      const country = countries[Math.floor(Math.random() * countries.length)];
      const timezone = timezones[Math.floor(Math.random() * timezones.length)];
      const education = educations[Math.floor(Math.random() * educations.length)];

      const { data: identity, error: idErr } = await supabaseAdmin
        .from("persona_identities")
        .insert({
          user_id: userId,
          archetype_id: archetype.id,
          username: p.username,
          profession,
          age: Math.floor(Math.random() * 18) + 22, // 22-40
          country,
          timezone,
          education,
          personality_json: {
            openness: 0.7 + Math.random() * 0.25,
            conscientiousness: 0.6 + Math.random() * 0.35,
            extraversion: 0.5 + Math.random() * 0.45,
            agreeableness: 0.6 + Math.random() * 0.35,
            neuroticism: 0.1 + Math.random() * 0.3
          },
          writing_style: {
            capitalization: "standard",
            slangUsage: Math.random() < 0.6,
            technicalDepth: 0.4 + Math.random() * 0.5
          },
          humor: 0.3 + Math.random() * 0.6,
          political_bias: 0.0,
          attention_span: 0.6 + Math.random() * 0.4,
          curiosity: 0.7 + Math.random() * 0.3,
          confidence: 0.6 + Math.random() * 0.3
        })
        .select("id")
        .single();

      if (idErr) {
        logger.error(`Error creating identity for ${p.username}: ${idErr.message}`);
        continue;
      }

      const identityId = identity.id;

      // Step D: Create Persona State
      const { error: stateErr } = await supabaseAdmin
        .from("persona_states")
        .insert({
          persona_id: identityId,
          valence: 0.1 + Math.random() * 0.8,
          arousal: 0.4 + Math.random() * 0.5,
          energy: 0.8 + Math.random() * 0.2,
          today_post_count: 0,
          today_comment_count: 0
        });

      if (stateErr) {
        logger.error(`Error creating state for ${p.username}: ${stateErr.message}`);
      }

      // Step E: Create Persona Conversation Profile
      // High reply probability, low response delays so they interact a lot!
      const postingProfileName = Math.random() < 0.10 
        ? "lurker" 
        : Math.random() < 0.05 
          ? "influencer" 
          : category.includes("Technology") 
            ? "engineer" 
            : category.includes("Design") 
              ? "designer" 
              : "marketer";

      const { error: profileErr } = await supabaseAdmin
        .from("persona_conversation_profiles")
        .insert({
          persona_id: identityId,
          conversation_role: Math.random() < 0.4 ? "mentor" : Math.random() < 0.7 ? "teacher" : "friend",
          avg_response_delay_minutes: Math.floor(Math.random() * 8) + 2, // 2-10 mins
          max_comments_per_thread: Math.floor(Math.random() * 3) + 2, // 2-4 comments
          reply_probability: parseFloat((0.65 + Math.random() * 0.25).toFixed(2)), // 65% - 90% chance to reply!
          question_probability: parseFloat((0.20 + Math.random() * 0.20).toFixed(2)),
          disagreement_probability: parseFloat((0.10 + Math.random() * 0.15).toFixed(2)),
          encouragement_probability: parseFloat((0.40 + Math.random() * 0.30).toFixed(2)),
          humor_probability: parseFloat((0.15 + Math.random() * 0.20).toFixed(2)),
          emoji_probability: parseFloat((0.20 + Math.random() * 0.25).toFixed(2)),
          thread_depth_limit: 4,
          duplicate_tolerance: 0.15,
          interruption_tolerance: 0.25,
          posting_profile_name: postingProfileName
        });

      if (profileErr) {
        logger.error(`Error creating conversation profile for ${p.username}: ${profileErr.message}`);
      }

      // Step F: Create Reputation
      const { error: repErr } = await supabaseAdmin
        .from("persona_reputations")
        .insert({
          persona_id: identityId,
          technical_credibility: 0.5 + Math.random() * 0.45,
          humor: 0.4 + Math.random() * 0.5,
          kindness: 0.6 + Math.random() * 0.4,
          toxicity: parseFloat((Math.random() * 0.1).toFixed(2)),
          helpfulness: 0.6 + Math.random() * 0.4
        });

      if (repErr) {
        logger.error(`Error creating reputation for ${p.username}: ${repErr.message}`);
      }

      // Step G: Create Social Goal
      const { error: goalErr } = await supabaseAdmin
        .from("persona_social_goals")
        .insert({
          persona_id: identityId,
          goal_type: Math.random() < 0.5 ? "become_respected" : "grow_followers",
          priority: 0.7 + Math.random() * 0.3,
          progress: 0.05
        });

      if (goalErr) {
        logger.error(`Error creating goal for ${p.username}: ${goalErr.message}`);
      }

      // Step H: Seed Interests and Expertise
      for (const ent of entities) {
        let weight = 0.1 + Math.random() * 0.3;
        let expertise = 0.1 + Math.random() * 0.3;

        if (category === "Technology & AI Future" && (ent.name.includes("Artificial Intelligence") || ent.name.includes("Open Source"))) {
          weight = 0.7 + Math.random() * 0.3;
          expertise = 0.6 + Math.random() * 0.4;
        } else if (category === "Design & UI/UX" && ent.name.includes("Design")) {
          weight = 0.7 + Math.random() * 0.3;
          expertise = 0.6 + Math.random() * 0.4;
        } else if (category === "Marketing & Growth" && ent.name.includes("Marketing")) {
          weight = 0.7 + Math.random() * 0.3;
          expertise = 0.6 + Math.random() * 0.4;
        }

        await supabaseAdmin.from("persona_interests").insert({
          persona_id: identityId,
          topic_entity_id: ent.id,
          weight: parseFloat(weight.toFixed(2))
        });

        await supabaseAdmin.from("persona_expertise").insert({
          persona_id: identityId,
          topic_entity_id: ent.id,
          knowledge_score: parseFloat(expertise.toFixed(2))
        });
      }

      createdCount++;
      if (createdCount % 10 === 0) {
        logger.info(`Successfully created ${createdCount}/${personasData.length} personas...`);
      }

    } catch (e: any) {
      logger.error(`Failed to process persona ${p.username}: ${e.message}`);
    }
  }

  logger.info(`--- Seeding completed! Created ${createdCount} new active personas successfully ---`);
}

seedPersonas().catch(err => {
  logger.error("Global seed error:", err);
  process.exit(1);
});
