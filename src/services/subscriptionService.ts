import { supabase, supabaseAdmin } from "../config/supabase";

// user_subscriptions has RLS enabled and only grants access to
// service_role (or the end user's own JWT, which the backend doesn't
// hold). Reading it with the anon client always returns zero rows,
// which made checkActiveSubscription reject every user with
// "No active subscription found." Use the service-role client.
const db = supabaseAdmin ?? supabase;

/**
 * Returns the active, non-expired subscription for a user, or null if none found.
 */
export async function getActiveSubscriptionForUser(userId: string) {
  const now = new Date().toISOString();
  const { data: subscription, error } = await db
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", now)
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !subscription) {
    return null;
  }
  return subscription;
}

/**
 * Returns all subscriptions for a user, ordered by expires_at descending.
 */
export async function getUserSubscriptions(userId: string) {
  const { data, error } = await db
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("expires_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Returns all available subscription tiers/plans, ordered by price ascending.
 */
export async function getSubscriptionTiers() {
  const { data, error } = await db
    .from("subscription_tiers")
    .select("*")
    .order("price", { ascending: true });
  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Returns the current user's subscription status (isPremium and active subscription details)
 */
export async function getUserSubscriptionStatus(userId: string) {
  const activeSubscription = await getActiveSubscriptionForUser(userId);
  return {
    isPremium: !!activeSubscription,
    activeSubscription: activeSubscription || null,
  };
}
