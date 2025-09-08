import { Request, Response } from "express";
import * as marketplaceService from "../services/marketplaceService";

/**
 * Create a new marketplace listing
 * @route POST /api/marketplace
 */
export async function createListing(req: Request, res: Response) {
  const userId = req.user?.id;
  const { listing, error } = await marketplaceService.createListing({
    ...req.body,
    seller_id: userId,
    status: "active",
  });
  if (error) {
    return res.status(400).json({ error });
  }
  return res.status(201).json({ listing });
}

/**
 * Get a marketplace listing by ID
 * @route GET /api/marketplace/:id
 */
export async function getListingById(req: Request, res: Response) {
  const { id } = req.params;
  const { listing, error } = await marketplaceService.getListingById(id);
  if (error) {
    return res.status(404).json({ error });
  }
  return res.status(200).json({ listing });
}

/**
 * Update a marketplace listing
 * @route PUT /api/marketplace/:id
 */
export async function updateListing(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const { listing, error, status } = await marketplaceService.updateListing(
    id,
    req.body,
    userId,
  );
  if (error) {
    return res.status(status || 400).json({ error });
  }
  return res.status(200).json({ listing });
}

/**
 * Delete a marketplace listing
 * @route DELETE /api/marketplace/:id
 */
export async function deleteListing(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const { error, status } = await marketplaceService.deleteListing(id, userId);
  if (error) {
    return res.status(status || 400).json({ error });
  }
  return res.status(204).send();
}

/**
 * List/filter marketplace listings
 * @route GET /api/marketplace
 */
export async function listListings(req: Request, res: Response) {
  const {
    category_id,
    seller_id,
    min_price,
    max_price,
    search,
    page = "1",
    limit = "20",
    sort = "newest",
  } = req.query;
  const result = await marketplaceService.listListings({
    category_id: category_id as string | undefined,
    seller_id: seller_id as string | undefined,
    min_price: min_price ? Number(min_price) : undefined,
    max_price: max_price ? Number(max_price) : undefined,
    search: search as string | undefined,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    sort: sort as string,
  });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  const pages = Math.ceil(result.total / (Number(limit) || 20));
  return res.status(200).json({
    listings: result.listings,
    meta: {
      total: result.total,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      pages,
    },
  });
}

/**
 * Get all listings for the current user
 * @route GET /api/marketplace/mine
 */
export async function getMyListings(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  // Accept filters from query
  const {
    category_id,
    min_price,
    max_price,
    search,
    page = "1",
    limit = "20",
    sort = "newest",
  } = req.query;
  console.log("my list");

  const result = await marketplaceService.listListings({
    seller_id: userId,
    category_id: category_id as string | undefined,
    min_price: min_price ? Number(min_price) : undefined,
    max_price: max_price ? Number(max_price) : undefined,
    search: search as string | undefined,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    sort: sort as string,
  });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  const pages = Math.ceil(result.total / result.limit);
  return res.status(200).json({
    listings: result.listings,
    meta: {
      total: result.total,
      page: Number(page) || 1,
      limit: result.limit,
      pages,
    },
  });
}

/**
 * Get all categories
 * @route GET /api/marketplace/categories
 */

export async function getCategories(req: Request, res: Response) {
  try {
    const categories = await marketplaceService.getAllCategories();
    res.status(200).json(categories);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch categories" });
  }
}
