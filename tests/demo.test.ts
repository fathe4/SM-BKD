// tests/demo.test.ts
// Simple demonstration test to verify the testing setup works

import { describe, it, expect, jest } from "@jest/globals";

describe("Feed Testing Setup Demo", () => {
  it("should verify Jest is working correctly", () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
  });

  it("should verify environment variables are set", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("should verify basic test data creation", () => {
    const testUser = {
      id: "user1",
      username: "testuser",
      created_at: new Date().toISOString()
    };

    expect(testUser.id).toBe("user1");
    expect(testUser.username).toBe("testuser");
    expect(testUser.created_at).toBeDefined();
  });

  it("should verify async functionality works", async () => {
    const asyncResult = await Promise.resolve("Feed tests are ready!");
    expect(asyncResult).toBe("Feed tests are ready!");
  });

  it("should verify mock functionality", () => {
    const mockFunction = jest.fn(() => "mocked response");
    const result = mockFunction();
    
    expect(result).toBe("mocked response");
    expect(mockFunction).toHaveBeenCalledTimes(1);
  });
});
