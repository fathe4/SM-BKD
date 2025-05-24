import { Request, Response } from "express";
import {
  getPhotosByPostId,
  getPhotosByUserId,
  createPhoto,
  deletePhoto,
  updatePhoto,
  PhotoCreate,
} from "../services/photoService";
import { AppError } from "../middlewares/errorHandler";

export const getPostPhotos = async (req: Request, res: Response) => {
  const { postId } = req.params;
  const photos = await getPhotosByPostId(postId);
  res.json(photos);
};

export const getUserPhotos = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const result = await getPhotosByUserId(userId, page, limit);
  res.json(result);
};

export const addPhoto = async (req: Request, res: Response) => {
  const photoData: PhotoCreate = {
    post_id: req.body.post_id,
    media_url: req.body.media_url,
    media_type: req.body.media_type,
  };

  const photo = await createPhoto(photoData);
  res.status(201).json(photo);
};

export const removePhoto = async (req: Request, res: Response) => {
  const { photoId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  await deletePhoto(photoId, userId);
  res.status(204).send();
};

export const modifyPhoto = async (req: Request, res: Response) => {
  const { photoId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  const updates: Partial<PhotoCreate> = {
    media_url: req.body.media_url,
    media_type: req.body.media_type,
  };

  const photo = await updatePhoto(photoId, userId, updates);
  res.json(photo);
};
