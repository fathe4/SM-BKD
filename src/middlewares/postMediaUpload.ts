// src/middlewares/postMediaUpload.ts
import multer from "multer";
import { logger } from "../utils/logger";

// Configure memory storage
const storage = multer.memoryStorage();

// File size limits
const maxSize = 20 * 1024 * 1024; // 20MB per file

// Allowed mime types
const allowedTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// File filter function
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Allowed types: images, videos, PDF, and documents",
      ),
    );
  }
};

// Create multer instance for post media
const postMediaUpload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter,
}).array("media", 10); // Allow up to 10 files

// Middleware function
export const uploadPostMedia = (req: any, res: any, next: any) => {
  postMediaUpload(req, res, (err: any) => {
    if (err) {
      logger.error("Post media upload error:", err);

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "fail",
            message: "File is too large. Maximum size is 20MB per file.",
          });
        }
        return res.status(400).json({
          status: "fail",
          message: `Upload error: ${err.message}`,
        });
      }

      return res.status(400).json({
        status: "fail",
        message: err.message,
      });
    }

    next();
  });
};
