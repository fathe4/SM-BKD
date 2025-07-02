import { Router } from "express";
import * as storyController from "../controllers/story.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// GET /api/stories - Get all active stories
router.get("/", storyController.getActiveStoriesHandler);

// GET /api/stories/:id - Get a single story by ID
router.get("/:id", storyController.getStoryByIdHandler);

// GET /api/stories/:id/views - Get all views for a story
router.get("/:id/views", storyController.getStoryViewsHandler);

// POST /api/stories - Create a new story
router.post("/", authenticate, storyController.createStoryHandler);

// DELETE /api/stories/:id - Delete a story
router.delete("/:id", authenticate, storyController.deleteStoryHandler);

// POST /api/stories/:id/view - Mark a story as viewed
router.post("/:id/view", authenticate, storyController.viewStoryHandler);

export default router;
