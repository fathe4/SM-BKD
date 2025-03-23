import { check } from "express-validator";
import { validateRequest } from "./validateRequest";
import { ReactionType } from "../../models/interaction.model";

/**
 * Validation rules for creating/updating reactions
 */
export const validateReaction = [
  // Reaction type validation
  check("reaction_type")
    .isIn(Object.values(ReactionType))
    .withMessage(
      "Invalid reaction type. Allowed values: like, love, haha, wow, sad, angry"
    ),

  validateRequest,
];
