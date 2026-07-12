import { supabaseAdmin } from "../config/supabase";

async function check() {
  console.log("--- SIMULATION DB STATE CHECK ---");
  
  // 1. Check Clock / Simulation State
  const { data: state } = await supabaseAdmin!.from("simulation_state").select("*").single();
  console.log("Global Simulation State:", state);

  // 2. Count feed candidates
  const { count: candCount } = await supabaseAdmin!.from("feed_candidates").select("*", { count: "exact", head: true });
  console.log("Total Feed Candidates:", candCount);

  // 3. Count feed items cached per persona
  const { data: items } = await supabaseAdmin!.from("feed_items").select("persona_id, score, reason").limit(5);
  console.log("Sample Ranked Feed Items:", items);

  // 4. Check decision logs
  const { data: logs } = await supabaseAdmin!.from("simulation_decision_logs").select("*").limit(3);
  console.log("Sample Decision Logs:", logs);

  // 5. Check queue jobs
  const { data: jobs } = await supabaseAdmin!.from("behavior_jobs").select("*").limit(5);
  console.log("Sample Behavior Queue Jobs:", jobs);
}

check().then(() => process.exit(0));
