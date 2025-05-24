import { Router } from "express";
import {
  getPostPhotos,
  getUserPhotos,
  addPhoto,
  removePhoto,
  modifyPhoto,
} from "../controllers/photoController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Public routes
router.get("/post/:postId", getPostPhotos);
router.get("/user/:userId", getUserPhotos);

// Protected routes
router.post("/", authenticate, addPhoto);
router.delete("/:photoId", authenticate, removePhoto);
router.patch("/:photoId", authenticate, modifyPhoto);

export default router;
