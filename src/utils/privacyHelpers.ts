/* eslint-disable indent */
// src/utils/privacyHelpers.ts
import { Request } from "express";
import { UUID } from "crypto";
import { AppError } from "../middlewares/errorHandler";
import { PrivacySettingsService } from "../services/privacySettingsService";

export async function getRequiredIds(
  req: Request,
  idFields: string[],
): Promise<Record<string, UUID>> {
  const result: Record<string, UUID> = {};

  // Always include authenticated user
  result.userId = req.user?.id as UUID;

  // Get other IDs from params or body
  for (const field of idFields) {
    result[field] = req.params[field] || req.body[field];
    if (!result[field]) {
      throw new AppError(`Required ID missing: ${field}`, 400);
    }
  }

  return result;
}

type PrivacySettings = Awaited<
  ReturnType<typeof PrivacySettingsService.getUserPrivacySettings>
>;

export async function getPrivacySettingsForUsers(
  userIds: UUID[],
): Promise<Record<string, PrivacySettings>> {
  const settings: Record<string, PrivacySettings> = {};

  for (const id of userIds) {
    settings[id as string] =
      await PrivacySettingsService.getUserPrivacySettings(id);
  }

  return settings;
}

export function canUserViewData(
  viewerId: UUID,
  ownerId: UUID,
  visibilityLevel: string,
  areFriends: boolean,
): boolean {
  if (viewerId === ownerId) return true;

  switch (visibilityLevel) {
    case "public":
      return true;
    case "friends":
      return areFriends;
    case "private":
      return false;
    default:
      return false;
  }
}
