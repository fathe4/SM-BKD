/* eslint-disable @typescript-eslint/no-explicit-any */
// src/middlewares/fileUpload.ts
import multer from "multer";
import { logger } from "../utils/logger";

// Configure memory storage
const storage = multer.memoryStorage();

// File size limits
const maxSize = {
  profilePicture: 5 * 1024 * 1024, // 5MB
  coverPicture: 10 * 1024 * 1024, // 10MB
  postMedia: 20 * 1024 * 1024, // 20MB
};

// Allowed mime types
const allowedImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
// const allowedVideoTypes = [
//   ...allowedImageTypes,
//   "video/mp4",
//   "video/quicktime",
// ];

// File filter function
const imageFileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${allowedImageTypes.join(", ")}`,
      ),
    );
  }
};

// Create multer instances
const profilePictureUpload = multer({
  storage,
  limits: { fileSize: maxSize.profilePicture },
  fileFilter: imageFileFilter,
}).single("profilePicture");

const coverPictureUpload = multer({
  storage,
  limits: { fileSize: maxSize.coverPicture },
  fileFilter: imageFileFilter,
}).single("coverPicture");

// Explicitly type the multer middleware as any to bypass TypeScript incompatibility
export const uploadProfilePicture = (req: any, res: any, next: any) => {
  profilePictureUpload(req, res, (err: any) => {
    if (err) {
      logger.error("Profile picture upload error:", err);

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "fail",
            message: "File is too large. Maximum size is 5MB.",
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

export const uploadCoverPicture = (req: any, res: any, next: any) => {
  coverPictureUpload(req, res, (err: any) => {
    if (err) {
      logger.error("Cover picture upload error:", err);

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "fail",
            message: "File is too large. Maximum size is 10MB.",
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
