// src/routes/searchRoutes.ts
import { Router } from "express";
import { SearchController } from "../controllers/searchController";
import {
  validateBasicSearch,
  validateAdvancedSearch,
} from "../middlewares/validators/searchValidator";

const router = Router();

/**
 * @route GET /api/v1/search/users
 * @desc Search users by text query
 * @access Public
 */
router.get("/users", validateBasicSearch, SearchController.searchUsers);

/**
 * @route POST /api/v1/search/users/advanced
 * @desc Advanced search for users with multiple criteria
 * @access Public
 */
router.post(
  "/users/advanced",
  validateAdvancedSearch,
  SearchController.advancedUserSearch,
);

// /**
//  * @route GET /api/v1/search/users/nearby
//  * @desc Search for users near the authenticated user
//  * @access Private
//  */
// router.get(
//   "/users/nearby",
//   authenticate,
//   validateNearbySearch,
//   SearchController.searchUsersNearby
// );

export default router;
