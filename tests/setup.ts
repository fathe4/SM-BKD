// tests/setup.ts
import { jest, beforeAll, afterAll } from '@jest/globals';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_ANON_KEY = 'test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.REDIS_URL = 'redis://localhost:6379';
});

afterAll(async () => {
  // Clean up after all tests
  jest.clearAllMocks();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create mock Supabase response
  createMockSupabaseResponse: (data: any = null, error: any = null) => ({
    data,
    error,
    count: data?.length || 0,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK'
  }),

  // Helper to create mock Redis responses
  createMockRedisResponse: (value: any = null) => {
    return Promise.resolve(value);
  }
};

// Extend global namespace for TypeScript
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    createMockSupabaseResponse: (data?: any, error?: any) => any;
    createMockRedisResponse: (value?: any) => Promise<any>;
  };
}

export {};
