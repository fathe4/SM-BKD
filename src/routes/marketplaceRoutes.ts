import { authenticate } from "./../middlewares/authenticate";
import { Router } from "express";
import { validateCreateListing } from "../middlewares/validators/marketplaceValidator";
import * as marketplaceController from "../controllers/marketplaceController";

const router = Router();

/**
 * @route GET /api/marketplace
 * @desc List/filter marketplace listings
 */
router.get("/", marketplaceController.listListings);

/**
 * @route POST /api/marketplace
 * @desc Create a new marketplace listing
 */
router.post(
  "/",
  authenticate,
  validateCreateListing,
  marketplaceController.createListing
);

/**
 * @route GET /api/marketplace/mine
 * @desc Get all listings for the current user
 */
router.get("/mine", authenticate, marketplaceController.getMyListings);

/**
 * @route GET /api/marketplace/categories
 * @desc Get all categories
 */
router.get("/categories", authenticate, marketplaceController.getCategories);

/**
 * @route GET /api/marketplace/:id
 * @desc Get a marketplace listing by ID
 */
router.get("/:id", marketplaceController.getListingById);

/**
 * @route PUT /api/marketplace/:id
 * @desc Update a marketplace listing
 */
router.put("/:id", authenticate, marketplaceController.updateListing);

/**
 * @route DELETE /api/marketplace/:id
 * @desc Delete a marketplace listing
 */
router.delete("/:id", authenticate, marketplaceController.deleteListing);

export default router;
