import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/user", authenticate, SubscriptionController.getUserSubscriptions);

router.get("/tiers", SubscriptionController.getSubscriptionTiers);

router.get(
  "/status",
  authenticate,
  SubscriptionController.getUserSubscriptionStatus,
);

export default router;
