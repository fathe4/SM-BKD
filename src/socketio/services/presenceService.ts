import { logger } from "../../utils/logger";

// Store active user statuses - Using Map for O(1) lookups
const userStatuses = new Map<
  string,
  {
    status: "online" | "offline" | "away";
    lastActive: Date;
    deviceInfo: {
      count: number;
      types: Set<string>;
    };
  }
>();

/**
 * Initialize the presence system
 */
export function initPresenceSystem(): void {
  // Schedule cleanup of offline users after 24 hours
  setInterval(
    () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      userStatuses.forEach((data, userId) => {
        if (data.status === "offline" && data.lastActive < twentyFourHoursAgo) {
          userStatuses.delete(userId);
        }
      });
    },
    60 * 60 * 1000,
  ); // Run hourly
}

/**
 * Update a user's online status
 */
export function updateUserStatus(
  userId: string,
  status: "online" | "offline" | "away",
  deviceType?: string,
): void {
  const userData = userStatuses.get(userId) || {
    status: "offline",
    lastActive: new Date(),
    deviceInfo: {
      count: 0,
      types: new Set<string>(),
    },
  };

  userData.status = status;
  userData.lastActive = new Date();

  if (deviceType) {
    userData.deviceInfo.count += status === "online" ? 1 : -1;
    if (status === "online") {
      userData.deviceInfo.types.add(deviceType);
    }
  }

  userStatuses.set(userId, userData);
  logger.debug(`Updated user ${userId} status to ${status}`);
}

/**
 * Get a user's online status
 */
export function getUserStatus(userId: string): {
  status: "online" | "offline" | "away";
  lastActive: Date;
  deviceCount: number;
} {
  const userData = userStatuses.get(userId);

  if (!userData) {
    return {
      status: "offline",
      lastActive: new Date(0),
      deviceCount: 0,
    };
  }

  return {
    status: userData.status,
    lastActive: userData.lastActive,
    deviceCount: userData.deviceInfo.count,
  };
}

/**
 * Get all online users
 */
export function getOnlineUsers(): string[] {
  const onlineUsers: string[] = [];

  userStatuses.forEach((data, userId) => {
    if (data.status === "online") {
      onlineUsers.push(userId);
    }
  });

  return onlineUsers;
}
