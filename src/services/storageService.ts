// src/services/storageService.ts
//
// Media storage is provided by Cloudinary (unsigned upload preset). This service
// is intentionally kept as a drop-in adapter so the existing callers
// (userService, postService, commentService, postController) do not change after
// migrating off Supabase Storage.
//
// Uploads use the same axios + FormData pattern already used by the AI
// ingestion jobs (see src/services/simulation/ingestion.service.ts). Only an
// unsigned upload preset + cloud name are required — both already live in the
// backend env (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET).
import axios from "axios";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import { FileUploadResult } from "../types/storage";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;
const CLOUDINARY_UPLOAD_URL = CLOUD_NAME
  ? `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`
  : "";

export class StorageService {
  /**
   * Upload a file to Cloudinary.
   * `bucketName` is accepted for signature compatibility but is not used —
   * Cloudinary organises files by `public_id` (folder/uuid), not buckets.
   */
  static async uploadFile(
    bucketName: string,
    file: Express.Multer.File,
    folder?: string,
  ): Promise<FileUploadResult> {
    try {
      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new AppError(
          "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET missing).",
          500,
        );
      }

      // Generate a unique public id so files never collide (mirrors the prior
      // Supabase behaviour of using a uuid filename).
      const fileExtension = path.extname(file.originalname);
      const uniqueId = crypto.randomUUID();
      const publicId = folder ? `${folder}/${uniqueId}` : uniqueId;

      // Wrap the buffer in a Blob so it is sent as a multipart file part by
      // axios. Cast through BlobPart: @types/node's Buffer<ArrayBufferLike>
      // isn't directly assignable to BlobPart (SharedArrayBuffer generic), but
      // at runtime Node's Blob accepts the Buffer (an ArrayBufferView) fine.
      const blob = new Blob([file.buffer as unknown as BlobPart], {
        type: file.mimetype,
      });

      const form = new FormData();
      form.append("file", blob, file.originalname);
      form.append("upload_preset", UPLOAD_PRESET);
      form.append("public_id", publicId);

      const response = await axios.post(CLOUDINARY_UPLOAD_URL, form, {
        timeout: 30000,
      });

      const secureUrl: string = response.data.secure_url;
      const returnedPublicId: string = response.data.public_id;

      return {
        fileName: path.basename(returnedPublicId) + fileExtension,
        filePath: returnedPublicId,
        fileType: file.mimetype,
        fileSize: file.size,
        publicUrl: secureUrl,
      };
    } catch (error: any) {
      logger.error(
        "Error uploading file to Cloudinary:",
        error?.response?.data || error?.message,
      );
      throw error instanceof AppError
        ? error
        : new AppError("Failed to upload file", 500);
    }
  }

  /**
   * Delete a file.
   * Cloudinary deletes require a signed request (API key + secret), which the
   * backend does not hold — uploads use an unsigned preset. This is therefore a
   * best-effort no-op. All call sites already wrap deleteFile in try/catch, so
   * orphaned Cloudinary assets are non-fatal.
   *
   * To enable real deletes later, add CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
   * to the backend env and perform a signed DELETE here.
   */
  static async deleteFile(bucketName: string, filePath: string): Promise<void> {
    logger.warn(
      `StorageService.deleteFile is a no-op (Cloudinary signed-delete not configured). Skipping: ${filePath}`,
    );
  }

  /**
   * Return a URL for a file. Cloudinary assets are public by default, so the
   * stored URL is returned as-is. (For private delivery, switch to a signed
   * Cloudinary URL using the API secret.)
   */
  static async getSignedUrl(
    bucketName: string,
    filePath: string,
    expiresIn = 60,
  ): Promise<string> {
    return filePath;
  }
}
