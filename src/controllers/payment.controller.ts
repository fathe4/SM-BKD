import { Request, Response } from "express";
import * as paymentService from "../services/payment";
import {
  createSubscriptionCheckoutSession,
  createPostBoostCheckoutSession,
} from "../services/payment";

/**
 * Handles the request to create a checkout session for a subscription.
 */
export async function createSubscriptionCheckout(req: Request, res: Response) {
  const { tierId, successUrl, cancelUrl } = req.body;

  console.log(tierId, successUrl, cancelUrl, "req.user?.id");

  if (!req.user?.id || !tierId || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const session = await createSubscriptionCheckoutSession(
      req.user?.id,
      tierId,
      successUrl,
      cancelUrl
    );
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handles the request to create a checkout session for a post boost.
 */
export async function createPostBoostCheckout(req: Request, res: Response) {
  const { userId, boostId, successUrl, cancelUrl } = req.body;

  if (!userId || !boostId || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const session = await createPostBoostCheckoutSession(
      userId,
      boostId,
      successUrl,
      cancelUrl
    );
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export const handleStripeWebhookController = async (req: Request, res: Response) => {
  try {
    console.log("=== WEBHOOK DEBUG ===");
    console.log("Body constructor:", req.body.constructor.name);
    console.log("Body toString():", req.body.toString().substring(0, 100));
    console.log(
      "Body JSON.stringify():",
      JSON.stringify(req.body).substring(0, 100)
    );
    console.log("Raw body as Buffer:", Buffer.from(JSON.stringify(req.body)));

    const sig = req.headers["stripe-signature"] as string;

    // Try different body formats
    let bodyToUse = req.body;
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      bodyToUse = Buffer.from(JSON.stringify(req.body));
      console.log("Converting object to Buffer");
    }

    await paymentService.handleStripeWebhook(bodyToUse, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("Webhook controller error:", error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};