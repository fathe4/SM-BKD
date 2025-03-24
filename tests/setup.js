"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/tests/setup.ts
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config({ path: ".env.test" });
// Mock JWT and other environment variables
process.env.JWT_SECRET = "test-jwt-secret";
process.env.JWT_EXPIRES_IN = "7d";
process.env.JWT_REFRESH_SECRET = "test-refresh-token-secret";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";
// Global beforeAll - runs once before all tests
beforeAll(() => {
    // Setup any test database or global mocks here
});
// Global afterAll - runs once after all tests
afterAll(() => {
    // Cleanup any test database or global mocks here
});
//# sourceMappingURL=setup.js.map