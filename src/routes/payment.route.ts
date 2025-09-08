import express, { Router } from "express";
import {
  createSubscriptionCheckout,
  createPostBoostCheckout,
  handleStripeWebhookController,
} from "../controllers/payment.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

/**
 * @route   POST /api/v1/payments/webhook
 * @desc    Stripe webhook handler
 * @access  Public
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhookController,
);

router.use(express.json());

/**
 * @route   POST /api/payments/checkout/subscription
 * @desc    Create a checkout session for a subscription
 * @access  Private
 */
router.post("/checkout/subscription", authenticate, createSubscriptionCheckout);

/**
 * @route   POST /api/payments/checkout/post-boost
 * @desc    Create a checkout session for a post boost
 * @access  Private
 */
router.post("/checkout/post-boost", authenticate, createPostBoostCheckout);

export default router;
