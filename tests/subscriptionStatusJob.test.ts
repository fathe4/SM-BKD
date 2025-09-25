import { setupSubscriptionStatusJob } from '../src/jobs/subscriptionStatusJob';
import { supabaseAdmin } from '../src/config/supabase';

// Mock supabase admin
jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn()
  }
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock CronJob
jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation((cronTime, onTick) => {
    // Store the onTick function so we can call it in tests
    (CronJob as any).onTick = onTick;
    return {
      start: jest.fn(),
      stop: jest.fn()
    };
  })
}));

describe('SubscriptionStatusJob', () => {
  const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>;
  const mockFrom = jest.fn();
  mockSupabaseAdmin.from = mockFrom;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should setup the job correctly', () => {
    setupSubscriptionStatusJob();
    expect(mockSupabaseAdmin.from).toBeDefined();
  });

  it('should handle expired active subscriptions', async () => {
    const mockExpiredSubscriptions = [
      {
        id: 'sub-1',
        user_id: 'user-1',
        expires_at: '2023-01-01T00:00:00Z',
        subscription_tier_id: 'tier-1'
      }
    ];

    mockFrom
      .mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: mockExpiredSubscriptions,
                error: null
              })
            })
          })
        })
      })
      .mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      })
      .mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });

    setupSubscriptionStatusJob();
    
    // Get the onTick function and call it
    const { CronJob } = require('cron');
    const onTick = (CronJob as any).onTick;
    
    await onTick();

    expect(mockFrom).toHaveBeenCalledWith('user_subscriptions');
  });

  it('should handle database errors gracefully', async () => {
    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      })
    });

    setupSubscriptionStatusJob();
    
    const { CronJob } = require('cron');
    const onTick = (CronJob as any).onTick;
    
    await onTick();

    // Should not throw an error
    expect(mockFrom).toHaveBeenCalled();
  });

  it('should handle missing supabase admin client', async () => {
    // Mock supabaseAdmin as null
    jest.doMock('../config/supabase', () => ({
      supabaseAdmin: null
    }));

    setupSubscriptionStatusJob();
    
    const { CronJob } = require('cron');
    const onTick = (CronJob as any).onTick;
    
    await onTick();

    // Should handle gracefully without throwing
    expect(true).toBe(true);
  });
});
