// src/middlewares/commentMediaUpload.ts
import multer from "multer";
import { logger } from "../utils/logger";

// Configure memory storage
const storage = multer.memoryStorage();

// File size limits
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Allowed mime types
const allowedMediaTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

// File filter function
const mediaFileFilter = (req: any, file: any, cb: any) => {
  if (allowedMediaTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${allowedMediaTypes.join(", ")}`
      )
    );
  }
};

// Create multer upload instance - can upload up to 3 images
const commentMediaUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 3 },
  fileFilter: mediaFileFilter,
}).array("media", 3);

// Middleware to handle comment media uploads
export const uploadCommentMedia = (req: any, res: any, next: any) => {
  commentMediaUpload(req, res, (err: any) => {
    if (err) {
      logger.error("Comment media upload error:", err);

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "fail",
            message: "File is too large. Maximum size is 5MB.",
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            status: "fail",
            message: "Too many files. Maximum is 3 files per comment.",
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
