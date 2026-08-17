import Stripe from "stripe";
import { supabase, supabaseAdmin } from "../config/supabase";
import { Tables, TablesInsert } from "../types/supabase";
import { PostService } from "./postService";
import { PaymentReferenceType } from "../models/marketplace.model";

// All payment DB operations are server-side: use the service-role
// client so Row Level Security doesn't block writes. The `payments`
// table only grants INSERT/UPDATE to service_role (anon is denied),
// which made checkout fail with "Failed to create payment record".
const db = supabaseAdmin ?? supabase;

// Initialize the Stripe client with your secret key.
// It's crucial to keep this key secure and use environment variables.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

/**
 * Internal helper to create a Stripe checkout session.
 * This is not exported to prevent clients from providing manipulated payment objects.
 *
 * @param {Tables<'payments'>} payment - The payment record from the database.
 * @param {string} successUrl - The URL to redirect to on successful payment.
 * @param {string} cancelUrl - The URL to redirect to on cancelled payment.
 * @returns {Promise<Stripe.Checkout.Session>} - The created checkout session.
 */
async function _createCheckoutSession(
  payment: Tables<"payments">,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  // Use the user's email for the Stripe customer.
  const { data: user, error: userError } = await db
    .from("users")
    .select("email")
    .eq("id", payment.user_id)
    .single();

  if (userError || !user) {
    throw new Error("User not found for payment.");
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: payment.currency,
        product_data: {
          name: `Payment for ${payment.reference_type}`,
          description: `ID: ${payment.reference_id}`,
        },
        unit_amount: payment.amount * 100, // Stripe expects the amount in cents.
      },
      quantity: 1,
    },
  ];

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: "payment",
    customer_email: user.email,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: payment.id,
    metadata: {
      payment_id: payment.id,
      user_id: payment.user_id,
      reference_id: payment.reference_id,
      reference_type: payment.reference_type,
    },
  });

  return session;
}

/**
 * Creates a checkout session for a marketplace subscription tier.
 * It fetches the price from the database to ensure it cannot be manipulated.
 *
 * @param {string} userId - The ID of the user making the purchase.
 * @param {string} tierId - The ID of the subscription tier being purchased.
 * @param {string} successUrl - The URL for successful payment redirection.
 * @param {string} cancelUrl - The URL for cancelled payment redirection.
 * @returns {Promise<Stripe.Checkout.Session>}
 */
export async function createSubscriptionCheckoutSession(
  userId: string,
  tierId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ id: string; url: string | null }> {
  const { data: tier, error: tierError } = await db
    .from("subscription_tiers")
    .select("price, duration_days")
    .eq("id", tierId)
    .single();

  if (tierError || !tier) {
    throw new Error("Subscription tier not found.");
  }

  // Free tiers (price 0) cannot go through Stripe — checkout sessions
  // must have a positive amount. Activate the subscription directly.
  if (Number(tier.price) <= 0) {
    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + tier.duration_days * 24 * 60 * 60 * 1000,
    );

    const { error: subscriptionError } = await db
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        subscription_tier_id: tierId,
        status: "active",
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (subscriptionError) {
      console.error("Supabase free subscription insert error:", subscriptionError);
      throw new Error("Failed to activate free subscription.");
    }

    return { id: `free-tier-${tierId}`, url: successUrl };
  }

  const paymentData: TablesInsert<"payments"> = {
    user_id: userId,
    amount: tier.price,
    currency: "usd", // Assuming USD, this could be dynamic in the future.
    status: "pending",
    reference_id: tierId,
    reference_type: PaymentReferenceType.SUBSCRIPTION,
    payment_method: "stripe",
  };

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (paymentError || !payment) {
    console.error("Supabase payment insert error:", paymentError);
    throw new Error(
      `Failed to create payment record. (${paymentError?.code ?? "unknown"}: ${paymentError?.message ?? "no row returned"})`,
    );
  }

  return _createCheckoutSession(payment, successUrl, cancelUrl);
}

/**
 * Creates a checkout session for boosting a post.
 * It fetches the price from the database to ensure it cannot be manipulated.
 *
 * @param {string} userId - The ID of the user boosting the post.
 * @param {string} boostId - The ID of the post_boosts record.
 * @param {string} successUrl - The URL for successful payment redirection.
 * @param {string} cancelUrl - The URL for cancelled payment redirection.
 * @returns {Promise<Stripe.Checkout.Session>}
 */
export async function createPostBoostCheckoutSession(
  userId: string,
  boostId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<Stripe.Checkout.Session> {
  const { data: boost, error: boostError } = await db
    .from("post_boosts")
    .select("amount")
    .eq("id", boostId)
    .single();

  if (boostError || !boost) {
    console.error("Post boost lookup error:", boostError);
    throw new Error("Post boost not found.");
  }

  const paymentData: TablesInsert<"payments"> = {
    user_id: userId,
    amount: boost.amount,
    currency: "usd", // Assuming USD
    status: "pending",
    reference_id: boostId,
    reference_type: PaymentReferenceType.BOOST,
    payment_method: "stripe",
  };

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (paymentError || !payment) {
    console.error("Supabase payment insert error (boost):", paymentError);
    throw new Error(
      `Failed to create payment record for boost. (${paymentError?.code ?? "unknown"}: ${paymentError?.message ?? "no row returned"})`,
    );
  }

  return _createCheckoutSession(payment, successUrl, cancelUrl);
}

/**
 * Handles incoming webhooks from Stripe to update payment statuses.
 * This is critical for activating subscriptions or boosts after successful payment.
 *
 * @param {Buffer} payload - The raw request body from the webhook.
 * @param {string} signature - The 'stripe-signature' header from the request.
 * @returns {Promise<void>}
 */
export const handleStripeWebhook = async (body: Buffer, signature: string) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error(
      "[StripeWebhook] ERROR: Stripe webhook secret is not configured",
    );
    throw new Error("Stripe webhook secret is not configured");
  }

  // Verify the event signature — the route passes the raw body via
  // express.raw. Without this, anyone could POST a forged
  // checkout.session.completed and get free boosts/subscriptions.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(
      "[StripeWebhook] ERROR: Signature verification failed — check that STRIPE_WEBHOOK_SECRET matches the Stripe webhook endpoint's signing secret:",
      err.message,
    );
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  console.log("[StripeWebhook] Event type:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("[StripeWebhook] session id:", session.id);
    const paymentId = session.metadata?.payment_id;
    console.log("[StripeWebhook] paymentId:", paymentId);

    if (!paymentId) {
      console.error(
        "[StripeWebhook] ERROR: Payment ID not found in checkout session metadata",
      );
      throw new Error("Payment ID not found in checkout session metadata");
    }

    const { data: payment, error: paymentError } = await db
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();
    console.log("[StripeWebhook] Fetched payment:", payment?.id ?? null);

    if (paymentError || !payment) {
      console.error(
        `[StripeWebhook] ERROR: Payment with ID ${paymentId} not found.`,
        paymentError,
      );
      throw new Error(`Payment with ID ${paymentId} not found.`);
    }

    // Update payment status
    const { error: updateError } = await db
      .from("payments")
      .update({
        status: "completed",
        transaction_id: session.id,
        completed_at: new Date(),
      })
      .eq("id", paymentId);
    console.log("[StripeWebhook] Updated payment status:", updateError);

    if (updateError) {
      console.error(
        `[StripeWebhook] ERROR: Failed to update payment status: ${updateError.message}`,
      );
      throw new Error(
        `Failed to update payment status: ${updateError.message}`,
      );
    }

    // Handle subscription creation
    if (
      payment.reference_type === PaymentReferenceType.SUBSCRIPTION &&
      payment.user_id &&
      payment.reference_id
    ) {
      console.log(
        "[StripeWebhook] Creating user subscription for user:",
        payment.user_id,
        "tier:",
        payment.reference_id,
      );
      const { data: tier, error: tierError } = await db
        .from("subscription_tiers")
        .select("duration_days")
        .eq("id", payment.reference_id)
        .single();

      if (tierError || !tier) {
        throw new Error(
          "Subscription tier not found for user subscription creation.",
        );
      }

      const startedAt = new Date();
      const expiresAt = new Date(
        startedAt.getTime() + tier.duration_days * 24 * 60 * 60 * 1000,
      );

      const { error: subError } = await db
        .from("user_subscriptions")
        .insert({
          user_id: payment.user_id,
          subscription_tier_id: payment.reference_id,
          started_at: startedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: "active",
        });
      if (subError) {
        console.error(
          `[StripeWebhook] ERROR: Failed to create user subscription: ${subError.message}`,
        );
        throw new Error(
          `Failed to create user subscription: ${subError.message}`,
        );
      }
    } else if (payment.reference_type === PaymentReferenceType.BOOST) {
      console.log(
        "payment.reference_id",
        payment.reference_id,
        "payment.reference_type",
        payment.reference_type,
      );
      // Activate the boost after successful payment
      await PostService.activateBoost(payment.reference_id);
    }
  }

  // Handle other events like subscription renewals or cancellations
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(
      "[StripeWebhook] customer.subscription.updated subscription:",
      subscription,
    );
    const { error } = await db
      .from("user_subscriptions")
      .update({ status: subscription.status })
      .eq("stripe_subscription_id", subscription.id);
    if (error) {
      console.error(
        `[StripeWebhook] ERROR: Failed to update subscription status: ${error.message}`,
      );
      throw new Error(`Failed to update subscription status: ${error.message}`);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    console.log(
      "[StripeWebhook] customer.subscription.deleted subscription:",
      subscription,
    );
    const { error } = await db
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("stripe_subscription_id", subscription.id);
    if (error) {
      console.error(
        `[StripeWebhook] ERROR: Failed to cancel subscription: ${error.message}`,
      );
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }
};
