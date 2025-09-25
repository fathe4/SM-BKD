import { StatsService } from '../src/services/statsService';
import { supabase } from '../src/config/supabase';

// Mock supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('StatsService', () => {
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;
  const mockFrom = jest.fn();
  mockSupabase.from = mockFrom;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getQuickStats', () => {
    it('should return quick stats for a user', async () => {
      const userId = 'test-user-id';
      
      // Mock posts data
      const mockPosts = [
        { id: '1', is_boosted: false },
        { id: '2', is_boosted: true },
        { id: '3', is_boosted: false }
      ];

      // Mock friendships data
      const mockFriendships = [
        { id: '1' },
        { id: '2' },
        { id: '3' }
      ];

      // Mock payments data
      const mockPayments = [
        { amount: 50.00 },
        { amount: 25.50 },
        { amount: 75.00 }
      ];

      // Setup mocks
      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockPosts, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            or: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockFriendships, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockPayments, error: null })
            })
          })
        });

      const result = await StatsService.getQuickStats(userId);

      expect(result).toEqual({
        totalPosts: 3,
        totalBoostedPosts: 1,
        totalFriends: 3,
        totalInvested: 150.50
      });
    });

    it('should handle errors gracefully', async () => {
      const userId = 'test-user-id';
      
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } })
          })
        })
      });

      await expect(StatsService.getQuickStats(userId)).rejects.toThrow('Failed to fetch quick statistics');
    });
  });

  describe('getUserStats', () => {
    it('should return comprehensive stats for a user', async () => {
      const userId = 'test-user-id';
      
      // Mock all the different data sources
      const mockPosts = [
        { id: '1', is_boosted: false },
        { id: '2', is_boosted: true }
      ];

      const mockFriendships = [{ id: '1' }, { id: '2' }];
      const mockPayments = [{ amount: 100.00 }];
      const mockSubscription = {
        status: 'active',
        subscription_tiers: { name: 'Premium' }
      };
      const mockStories = [{ id: '1' }];
      const mockComments = [{ id: '1' }, { id: '2' }];
      const mockReactions = [{ id: '1' }];
      const mockSavedItems = [{ id: '1' }];
      const mockListings = [{ id: '1' }];
      const mockRatings = [{ rating: 5 }, { rating: 4 }];
      const mockUser = {
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Setup all mocks
      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockPosts, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            or: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockFriendships, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockPayments, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockSubscription, error: null })
              })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockStories, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockComments, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockReactions, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockSavedItems, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockListings, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: mockRatings, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
            })
          })
        });

      const result = await StatsService.getUserStats(userId);

      expect(result).toEqual({
        userId,
        totalPosts: 2,
        totalBoostedPosts: 1,
        totalFriends: 2,
        totalInvested: 100.00,
        subscriptionStatus: 'active',
        subscriptionTier: 'Premium',
        totalStories: 1,
        totalComments: 2,
        totalReactions: 1,
        totalSavedItems: 1,
        totalMarketplaceListings: 1,
        averageRating: 4.5,
        totalRatings: 2,
        lastActiveAt: '2024-01-01T00:00:00Z',
        accountCreatedAt: '2023-01-01T00:00:00Z'
      });
    });
  });
});
