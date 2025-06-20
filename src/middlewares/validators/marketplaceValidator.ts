// src/middlewares/validators/marketplaceValidator.ts
import { z } from "zod";
import { Request, Response, NextFunction } from "express";

// Define the Zod schema
export const createListingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  price: z.number().positive("Price must be positive"),
  category_id: z.string().uuid("Invalid category ID"),
  images: z
    .array(z.string().url("Invalid image URL"))
    .min(1, "At least one image is required"),
  // Add other fields as needed
});

// Middleware for validation
export function validateCreateListing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const result = createListingSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  req.body = result.data; // Use the parsed/typed data
  next();
}
