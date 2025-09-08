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
      cancelUrl,
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
      cancelUrl,
    );
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export const handleStripeWebhookController = async (
  req: Request,
  res: Response,
) => {
  try {
    console.log("WEBHOOK");

    const sig = req.headers["stripe-signature"] as string;
    await paymentService.handleStripeWebhook(req.body, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};
