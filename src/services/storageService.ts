// src/services/storageService.ts
import { supabase } from "../config/supabase";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/errorHandler";
import path from "path";
import crypto from "crypto";
import { FileUploadResult } from "../types/storage";

export class StorageService {
  /**
   * Upload a file to Supabase Storage
   */
  static async uploadFile(
    bucketName: string,
    file: Express.Multer.File,
    folder?: string
  ): Promise<FileUploadResult> {
    try {
      // Generate a unique filename to prevent collisions
      const fileExtension = path.extname(file.originalname);
      const uniqueId = crypto.randomUUID();
      const fileName = `${uniqueId}${fileExtension}`;

      // Create the full path including folder if provided
      const filePath = folder ? `${folder}/${fileName}` : fileName;

      // Upload the file to Supabase Storage
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        logger.error("Error uploading file to storage:", error);
        throw new AppError(`Failed to upload file: ${error.message}`, 400);
      }

      // Generate the public URL for the file
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      return {
        fileName,
        filePath,
        fileType: file.mimetype,
        fileSize: file.size,
        publicUrl: urlData.publicUrl,
      };
    } catch (error) {
      logger.error("Error in uploadFile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to upload file", 500);
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  static async deleteFile(bucketName: string, filePath: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);

      if (error) {
        logger.error("Error deleting file from storage:", error);
        throw new AppError(`Failed to delete file: ${error.message}`, 400);
      }
    } catch (error) {
      logger.error("Error in deleteFile service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete file", 500);
    }
  }

  /**
   * Get a signed URL for a file (for private files)
   */
  static async getSignedUrl(
    bucketName: string,
    filePath: string,
    expiresIn = 60
  ): Promise<string> {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        logger.error("Error creating signed URL:", error);
        throw new AppError(
          `Failed to create signed URL: ${error.message}`,
          400
        );
      }

      return data.signedUrl;
    } catch (error) {
      logger.error("Error in getSignedUrl service:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get signed URL", 500);
    }
  }
}
