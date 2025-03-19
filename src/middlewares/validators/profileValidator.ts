// src/middlewares/validators/profileValidator.ts
import { check } from "express-validator";
import { validateRequest } from "./validateRequest";

/**
 * Validation rules for profile updates
 */
export const profileValidationRules = [
  // Location validation
  check("location")
    .optional()
    .isString()
    .withMessage("Location must be a string")
    .trim(),

  // Coordinates validation
  check("coordinates")
    .optional()
    .isObject()
    .withMessage("Coordinates must be an object")
    .custom((value) => {
      if (!value.latitude || !value.longitude) {
        throw new Error("Coordinates must include latitude and longitude");
      }
      if (
        typeof value.latitude !== "number" ||
        typeof value.longitude !== "number"
      ) {
        throw new Error("Coordinates must be numbers");
      }
      if (value.longitude < -180 || value.longitude > 180) {
        throw new Error("Longitude must be between -180 and 180");
      }
      if (value.latitude < -90 || value.latitude > 90) {
        throw new Error("Latitude must be between -90 and 90");
      }
      return true;
    }),

  // Interests validation
  check("interests")
    .optional()
    .isObject()
    .withMessage("Interests must be an object"),

  check("interests.categories")
    .optional()
    .isArray()
    .withMessage("Categories must be an array"),

  check("interests.tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array"),

  // Birth date validation
  check("birth_date")
    .optional()
    .isISO8601()
    .withMessage("Birth date must be a valid date")
    .custom((value) => {
      const birthDate = new Date(value);
      const now = new Date();
      const age = now.getFullYear() - birthDate.getFullYear();

      if (age < 13) {
        throw new Error("You must be at least 13 years old");
      }

      return true;
    }),

  // Occupation validation
  check("occupation")
    .optional()
    .isString()
    .withMessage("Occupation must be a string")
    .trim(),

  // Education validation
  check("education")
    .optional()
    .isString()
    .withMessage("Education must be a string")
    .trim(),

  // Relationship status validation
  check("relationship_status")
    .optional()
    .isIn([
      "single",
      "in_relationship",
      "engaged",
      "married",
      "complicated",
      "separated",
      "divorced",
      "widowed",
      "not_specified",
    ])
    .withMessage("Invalid relationship status"),
];

/**
 * Combined middleware for profile validation
 */
export const validateProfileUpdate = [
  ...profileValidationRules,
  validateRequest,
];
