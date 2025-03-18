import { UserService } from "../services/userService";
import { UserRole } from "../types/models";
import { logger } from "../utils/logger";
import { config } from "dotenv";
import bcrypt from "bcryptjs";

config();

async function testUserService() {
  try {
    logger.info("Testing UserService...");

    // 1. Create a test user
    const passwordHash = await bcrypt.hash("TestPassword123", 10);
    const testUser = await UserService.createUser({
      email: "test@example.com",
      password_hash: passwordHash,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
      bio: "This is a test user",
      role: UserRole.USER,
      is_verified: false,
      is_active: true,
      settings: { theme: "light", notifications: true },
    });

    logger.info("Test user created:", testUser.id);

    // 2. Find user by email
    const foundUser = await UserService.findUserByEmail("test@example.com");
    if (foundUser?.id === testUser.id) {
      logger.info("Successfully found user by email");
    } else {
      throw new Error("Failed to find user by email");
    }

    // 3. Update user
    const updatedUser = await UserService.updateUser(testUser.id, {
      bio: "Updated bio for testing",
    });
    if (updatedUser.bio === "Updated bio for testing") {
      logger.info("Successfully updated user");
    } else {
      throw new Error("Failed to update user");
    }

    // 4. Create a profile
    const testProfile = await UserService.upsertProfile({
      user_id: testUser.id,
      location: "Test City",
      coordinates: [34.0522, -118.2437], // Los Angeles coordinates
      interests: ["testing", "coding", "debugging"],
      occupation: "Software Tester",
      relationship_status: "Single",
    });
    logger.info("Test profile created:", testProfile.id);

    // 5. Retrieve the profile
    const foundProfile = await UserService.getProfile(testUser.id);
    if (foundProfile?.id === testProfile.id) {
      logger.info("Successfully found profile");
    } else {
      throw new Error("Failed to find profile");
    }

    // 6. Register a device
    const testDevice = await UserService.registerUserDevice({
      user_id: testUser.id,
      device_token: "test-device-token",
      device_type: "web",
      ip_address: "127.0.0.1",
      last_active: new Date().toISOString(),
    });
    logger.info("Test device registered:", testDevice.id);

    // 7. Track a location
    const testLocation = await UserService.trackUserLocation({
      user_id: testUser.id,
      device_id: testDevice.id,
      coordinates: [34.0522, -118.2437], // Los Angeles coordinates
      city: "Los Angeles",
      country: "USA",
      is_active: true,
      location_source: "manual",
      additional_metadata: { accuracy: "high", source: "test" },
    });
    logger.info("Test location tracked:", testLocation.id);

    // 8. Create a second test user for friendship test
    const secondPasswordHash = await bcrypt.hash("TestPassword456", 10);
    const secondUser = await UserService.createUser({
      email: "friend@example.com",
      password_hash: secondPasswordHash,
      first_name: "Friend",
      last_name: "User",
      username: "frienduser",
      role: UserRole.USER,
      is_verified: false,
      is_active: true,
    });
    logger.info("Second test user created:", secondUser.id);

    // 9. Create a friendship
    const testFriendship = await UserService.createFriendship(
      testUser.id,
      secondUser.id
    );
    logger.info("Test friendship created:", testFriendship.id);

    // 10. Update friendship status
    const updatedFriendship = await UserService.updateFriendshipStatus(
      testFriendship.id,
      "accepted"
    );
    if (updatedFriendship.status === "accepted") {
      logger.info("Successfully updated friendship status");
    } else {
      throw new Error("Failed to update friendship status");
    }

    logger.info("UserService tests completed successfully!");
  } catch (error) {
    logger.error("Error testing UserService:", error);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  testUserService().catch((error) => {
    logger.error("Tests failed:", error);
    process.exit(1);
  });
}

export default testUserService;
