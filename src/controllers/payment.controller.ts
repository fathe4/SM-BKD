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

export const handleStripeWebhookController = async (
  req: Request,
  res: Response
) => {
  try {
    console.log("WEBHOOK");

    const sig = req.headers["stripe-signature"] as string;

    // Fix the Buffer issue - get the original raw body
    let rawBody: Buffer;

    if (Buffer.isBuffer(req.body)) {
      // Check if this is a serialized Buffer object that needs reconstruction
      const bodyString = req.body.toString();

      // If it starts with JSON, it means the Buffer was serialized
      if (
        bodyString.startsWith("{") &&
        // eslint-disable-next-line quotes
        bodyString.includes('"type":"Buffer"')
      ) {
        try {
          const parsedBody = JSON.parse(bodyString);
          if (parsedBody.type === "Buffer" && Array.isArray(parsedBody.data)) {
            // Reconstruct the original Buffer from the data array
            rawBody = Buffer.from(parsedBody.data);
            console.log(
              "[StripeWebhook] Reconstructed Buffer from serialized data"
            );
          } else {
            rawBody = req.body;
          }
        } catch (e) {
          rawBody = req.body;
        }
      } else {
        rawBody = req.body;
      }
    } else if (typeof req.body === "string") {
      rawBody = Buffer.from(req.body, "utf8");
    } else {
      // If it's an object, stringify it
      rawBody = Buffer.from(JSON.stringify(req.body), "utf8");
    }

    console.log("[DEBUG] Using raw body length:", rawBody.length);
    console.log(
      "[DEBUG] Raw body preview:",
      rawBody.toString().substring(0, 100)
    );

    await paymentService.handleStripeWebhook(rawBody, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("Webhook controller error:", error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};