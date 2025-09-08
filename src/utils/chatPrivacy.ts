// src/utils/chatPrivacy.ts
import { UUID } from "crypto";
import { FriendshipService } from "../services/friendshipService";

export async function canSeeOnlineStatus(
  viewerId: UUID,
  targetId: UUID,
  targetSettings: any,
): Promise<boolean> {
  // Same user can always see their own status
  if (viewerId === targetId) return true;

  const showOnlineStatus =
    targetSettings.settings.baseSettings.showOnlineStatus;
  if (!showOnlineStatus) return false;

  // Check visibility level
  const profileVisibility =
    targetSettings.settings.baseSettings.profileVisibility;
  if (profileVisibility === "public") return true;
  if (profileVisibility === "private") return false;

  // For 'friends' visibility, check friendship
  return await FriendshipService.checkIfUsersAreFriends(viewerId, targetId);
}

export async function canSeeLastActive(
  viewerId: UUID,
  targetId: UUID,
  targetSettings: any,
): Promise<boolean> {
  // Similar to online status but with lastActive setting
  if (viewerId === targetId) return true;

  const showLastActive = targetSettings.settings.baseSettings.showLastActive;
  if (!showLastActive) return false;

  // Rest of logic similar to canSeeOnlineStatus
  const profileVisibility =
    targetSettings.settings.baseSettings.profileVisibility;
  if (profileVisibility === "public") return true;
  if (profileVisibility === "private") return false;

  return await FriendshipService.checkIfUsersAreFriends(viewerId, targetId);
}

export function shouldSendReadReceipt(
  senderSettings: any,
  recipientSettings: any,
): boolean {
  // Check both users' read receipt preferences
  return (
    senderSettings.settings.messagePrivacy?.allowMessageReadReceipts &&
    recipientSettings.settings.messagePrivacy?.allowMessageReadReceipts
  );
}
