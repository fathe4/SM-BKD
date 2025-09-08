import { Request, Response } from "express";
import * as storyService from "../services/story.service";
import { AuthenticatedRequest } from "../types/request";

export const createStoryHandler = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    console.log(req.user, "req.user");

    // if (!req.user) {
    //   return res.status(401).json({ message: "Authentication required." });
    // }
    const userId = req?.user?.id;
    const storyData = { ...req.body, user_id: userId };
    const story = await storyService.createStory(storyData);
    res.status(201).json(story);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getActiveStoriesHandler = async (req: Request, res: Response) => {
  try {
    // Get page and limit from query string, with default values
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const stories = await storyService.getActiveStories({ page, limit });
    res.status(200).json(stories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const getStoryByIdHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const story = await storyService.getStoryById(id);
    if (!story) {
      return res
        .status(404)
        .json({ message: "Story not found or has expired." });
    }
    res.status(200).json(story);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStoryHandler = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { id } = req.params;
    const userId = req.user.id;

    const story = await storyService.getStoryById(id);
    if (!story) {
      return res.status(404).json({ message: "Story not found." });
    }

    if (story.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this story." });
    }

    await storyService.deleteStory(id, userId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const viewStoryHandler = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { id } = req.params;
    const userId = req.user.id;
    await storyService.viewStory(id, userId);
    res.status(200).json({ message: "Story viewed successfully." });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getStoryViewsHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const views = await storyService.getStoryViews(id);
    res.status(200).json(views);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
