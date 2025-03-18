import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { logger } from "../utils/logger";

config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  logger.error("Missing Supabase credentials. Check your .env file");
  process.exit(1);
}

// Create a Supabase client with the anon key (for client-side operations)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create a Supabase admin client with the service role key (for server-side operations)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Function to check if the Supabase connection is working
export const checkSupabaseConnection = async () => {
  try {
    const { error } = await supabase.from("users").select("count").limit(1);

    if (error) {
      throw error;
    }

    logger.info("Supabase connection successful");
    return true;
  } catch (error) {
    logger.error("Supabase connection failed", error);
    return false;
  }
};
