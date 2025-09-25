import { supabase } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

export interface UserStats {
  userId: string;
  totalPosts: number;
  totalBoostedPosts: number;
  totalFriends: number;
  totalInvested: number;
  boostInvestments: number;
  subscriptionInvestments: number;
  totalPayments: number;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  totalStories: number;
  totalComments: number;
  totalReactions: number;
  totalSavedItems: number;
  totalMarketplaceListings: number;
  averageRating: number | null;
  totalRatings: number;
  lastActiveAt: string | null;
  accountCreatedAt: string | null;
}

export class StatsService {
  /**
   * Get comprehensive user statistics
   */
  static async getUserStats(userId: string): Promise<UserStats> {
    try {
      logger.info(`Fetching stats for user: ${userId}`);

      // Get all stats in parallel for better performance
      const [
        postsStats,
        friendsStats,
        paymentsStats,
        subscriptionStats,
        storiesStats,
        commentsStats,
        reactionsStats,
        savedItemsStats,
        marketplaceStats,
        userInfo
      ] = await Promise.all([
        this.getPostsStats(userId),
        this.getFriendsStats(userId),
        this.getPaymentsStats(userId),
        this.getSubscriptionStats(userId),
        this.getStoriesStats(userId),
        this.getCommentsStats(userId),
        this.getReactionsStats(userId),
        this.getSavedItemsStats(userId),
        this.getMarketplaceStats(userId),
        this.getUserInfo(userId)
      ]);

      const stats: UserStats = {
        userId,
        totalPosts: postsStats.totalPosts,
        totalBoostedPosts: postsStats.totalBoostedPosts,
        totalFriends: friendsStats.totalFriends,
        totalInvested: paymentsStats.totalInvested,
        boostInvestments: paymentsStats.boostInvestments,
        subscriptionInvestments: paymentsStats.subscriptionInvestments,
        totalPayments: paymentsStats.totalPayments,
        subscriptionStatus: subscriptionStats.status,
        subscriptionTier: subscriptionStats.tier,
        totalStories: storiesStats.totalStories,
        totalComments: commentsStats.totalComments,
        totalReactions: reactionsStats.totalReactions,
        totalSavedItems: savedItemsStats.totalSavedItems,
        totalMarketplaceListings: marketplaceStats.totalListings,
        averageRating: marketplaceStats.averageRating,
        totalRatings: marketplaceStats.totalRatings,
        lastActiveAt: userInfo.lastActiveAt,
        accountCreatedAt: userInfo.accountCreatedAt
      };

      logger.info(`Successfully fetched stats for user: ${userId}`);
      return stats;
    } catch (error) {
      logger.error(`Error fetching stats for user ${userId}:`, error);
      throw new AppError("Failed to fetch user statistics", 500);
    }
  }

  /**
   * Get posts statistics
   */
  private static async getPostsStats(userId: string) {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, is_boosted")
      .eq("user_id", userId)
      .eq("is_deleted", false);

    if (postsError) {
      logger.error("Error fetching posts stats:", postsError);
      throw new AppError("Failed to fetch posts statistics", 500);
    }

    const totalPosts = posts?.length || 0;
    const totalBoostedPosts = posts?.filter(post => post.is_boosted).length || 0;

    return { totalPosts, totalBoostedPosts };
  }

  /**
   * Get friends statistics
   */
  private static async getFriendsStats(userId: string) {
    const { data: friendships, error: friendsError } = await supabase
      .from("friendships")
      .select("id")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted");

    if (friendsError) {
      logger.error("Error fetching friends stats:", friendsError);
      throw new AppError("Failed to fetch friends statistics", 500);
    }

    return { totalFriends: friendships?.length || 0 };
  }

  /**
   * Get comprehensive investment statistics
   */
  private static async getPaymentsStats(userId: string) {
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount, reference_type, created_at")
      .eq("user_id", userId)
      .eq("status", "completed");

    if (paymentsError) {
      logger.error("Error fetching payments stats:", paymentsError);
      throw new AppError("Failed to fetch payments statistics", 500);
    }

    // Calculate investments by type
    const boostInvestments = payments
      ?.filter(payment => payment.reference_type === "boost")
      ?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

    const subscriptionInvestments = payments
      ?.filter(payment => payment.reference_type === "subscription")
      ?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

    const totalInvested = payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

    return { 
      totalInvested,
      boostInvestments,
      subscriptionInvestments,
      totalPayments: payments?.length || 0
    };
  }

  /**
   * Get subscription statistics
   */
  private static async getSubscriptionStats(userId: string) {
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select(
        `
        status,
        subscription_tier_id,
        subscription_tiers (
          name
        )
      `
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (subscriptionError && subscriptionError.code !== "PGRST116") {
      logger.error("Error fetching subscription stats:", subscriptionError);
      throw new AppError("Failed to fetch subscription statistics", 500);
    }

    return {
      status: subscription?.status || null,
      tier: subscription?.subscription_tiers?.[0]?.name || null
    };
  }

  /**
   * Get stories statistics
   */
  private static async getStoriesStats(userId: string) {
    const { data: stories, error: storiesError } = await supabase
      .from("stories")
      .select("id")
      .eq("user_id", userId);

    if (storiesError) {
      logger.error("Error fetching stories stats:", storiesError);
      throw new AppError("Failed to fetch stories statistics", 500);
    }

    return { totalStories: stories?.length || 0 };
  }

  /**
   * Get comments statistics
   */
  private static async getCommentsStats(userId: string) {
    const { data: comments, error: commentsError } = await supabase
      .from("comments")
      .select("id")
      .eq("user_id", userId)
      .eq("is_deleted", false);

    if (commentsError) {
      logger.error("Error fetching comments stats:", commentsError);
      throw new AppError("Failed to fetch comments statistics", 500);
    }

    return { totalComments: comments?.length || 0 };
  }

  /**
   * Get reactions statistics
   */
  private static async getReactionsStats(userId: string) {
    const { data: reactions, error: reactionsError } = await supabase
      .from("reactions")
      .select("id")
      .eq("user_id", userId);

    if (reactionsError) {
      logger.error("Error fetching reactions stats:", reactionsError);
      throw new AppError("Failed to fetch reactions statistics", 500);
    }

    return { totalReactions: reactions?.length || 0 };
  }

  /**
   * Get saved items statistics
   */
  private static async getSavedItemsStats(userId: string) {
    const { data: savedItems, error: savedItemsError } = await supabase
      .from("saved_items")
      .select("id")
      .eq("user_id", userId);

    if (savedItemsError) {
      logger.error("Error fetching saved items stats:", savedItemsError);
      throw new AppError("Failed to fetch saved items statistics", 500);
    }

    return { totalSavedItems: savedItems?.length || 0 };
  }

  /**
   * Get marketplace statistics
   */
  private static async getMarketplaceStats(userId: string) {
    const { data: listings, error: listingsError } = await supabase
      .from("marketplace_listings")
      .select("id")
      .eq("seller_id", userId);

    if (listingsError) {
      logger.error("Error fetching marketplace stats:", listingsError);
      throw new AppError("Failed to fetch marketplace statistics", 500);
    }

    // Get seller ratings
    const { data: ratings, error: ratingsError } = await supabase
      .from("seller_ratings")
      .select("rating")
      .eq("seller_id", userId);

    if (ratingsError) {
      logger.error("Error fetching seller ratings:", ratingsError);
      throw new AppError("Failed to fetch seller ratings", 500);
    }

    const totalListings = listings?.length || 0;
    const totalRatings = ratings?.length || 0;
    const averageRating = totalRatings > 0 
      ? ratings?.reduce((sum, rating) => sum + rating.rating, 0) / totalRatings 
      : null;

    return { totalListings, totalRatings, averageRating };
  }

  /**
   * Get basic user information
   */
  private static async getUserInfo(userId: string) {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("created_at, updated_at")
      .eq("id", userId)
      .single();

    if (userError) {
      logger.error("Error fetching user info:", userError);
      throw new AppError("Failed to fetch user information", 500);
    }

    return {
      accountCreatedAt: user?.created_at || null,
      lastActiveAt: user?.updated_at || null
    };
  }

  /**
   * Get simplified stats for quick overview
   */
  static async getQuickStats(userId: string) {
    try {
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, is_boosted")
        .eq("user_id", userId)
        .eq("is_deleted", false);

      const { data: friendships, error: friendsError } = await supabase
        .from("friendships")
        .select("id")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted");

      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "completed");

      if (postsError || friendsError || paymentsError) {
        throw new AppError("Failed to fetch quick stats", 500);
      }

      return {
        totalPosts: posts?.length || 0,
        totalBoostedPosts: posts?.filter(post => post.is_boosted).length || 0,
        totalFriends: friendships?.length || 0,
        totalInvested: payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0
      };
    } catch (error) {
      logger.error(`Error fetching quick stats for user ${userId}:`, error);
      throw new AppError("Failed to fetch quick statistics", 500);
    }
  }

  /**
   * Get detailed investment breakdown for a user
   */
  static async getInvestmentBreakdown(userId: string) {
    try {
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select(`
          id,
          amount,
          reference_type,
          reference_id,
          created_at,
          completed_at,
          payment_method,
          currency
        `)
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (paymentsError) {
        logger.error("Error fetching investment breakdown:", paymentsError);
        throw new AppError("Failed to fetch investment breakdown", 500);
      }

      // Group payments by type
      const boostPayments = payments?.filter(p => p.reference_type === "boost") || [];
      const subscriptionPayments = payments?.filter(p => p.reference_type === "subscription") || [];

      // Calculate totals
      const boostTotal = boostPayments.reduce((sum, p) => sum + p.amount, 0);
      const subscriptionTotal = subscriptionPayments.reduce((sum, p) => sum + p.amount, 0);
      const grandTotal = boostTotal + subscriptionTotal;

      // Get recent investments (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const recentPayments = payments?.filter(p => p.created_at && p.created_at >= thirtyDaysAgo) || [];
      const recentTotal = recentPayments.reduce((sum, p) => sum + p.amount, 0);

      return {
        totalInvestments: grandTotal,
        boostInvestments: {
          total: boostTotal,
          count: boostPayments.length,
          payments: boostPayments
        },
        subscriptionInvestments: {
          total: subscriptionTotal,
          count: subscriptionPayments.length,
          payments: subscriptionPayments
        },
        recentInvestments: {
          total: recentTotal,
          count: recentPayments.length,
          period: "30 days"
        },
        allPayments: payments || []
      };
    } catch (error) {
      logger.error(`Error fetching investment breakdown for user ${userId}:`, error);
      throw new AppError("Failed to fetch investment breakdown", 500);
    }
  }

  /**
   * Get investment statistics by time period
   */
  static async getInvestmentStatsByTime(userId: string, days: number = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, reference_type, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("created_at", startDate)
        .order("created_at", { ascending: false });

      if (paymentsError) {
        logger.error("Error fetching investment stats by time:", paymentsError);
        throw new AppError("Failed to fetch investment stats by time", 500);
      }

      const boostInvestments = payments
        ?.filter(p => p.reference_type === "boost")
        ?.reduce((sum, p) => sum + p.amount, 0) || 0;

      const subscriptionInvestments = payments
        ?.filter(p => p.reference_type === "subscription")
        ?.reduce((sum, p) => sum + p.amount, 0) || 0;

      return {
        period: `${days} days`,
        totalInvestments: boostInvestments + subscriptionInvestments,
        boostInvestments,
        subscriptionInvestments,
        totalTransactions: payments?.length || 0,
        averageTransaction: payments?.length ? (boostInvestments + subscriptionInvestments) / payments.length : 0
      };
    } catch (error) {
      logger.error(`Error fetching investment stats by time for user ${userId}:`, error);
      throw new AppError("Failed to fetch investment stats by time", 500);
    }
  }

  /**
   * Test function to demonstrate investment tracking
   */
  static async testInvestmentTracking(userId: string) {
    try {
      console.log(`Testing investment tracking for user: ${userId}`);
      
      // Get comprehensive user stats (includes investment breakdown)
      const userStats = await this.getUserStats(userId);
      console.log("User Stats Investment Summary:");
      console.log(`- Total Invested: $${userStats.totalInvested}`);
      console.log(`- Boost Investments: $${userStats.boostInvestments}`);
      console.log(`- Subscription Investments: $${userStats.subscriptionInvestments}`);
      console.log(`- Total Payments: ${userStats.totalPayments}`);
      
      // Get detailed investment breakdown
      const breakdown = await this.getInvestmentBreakdown(userId);
      console.log("\nDetailed Investment Breakdown:");
      console.log(`- Total Investments: $${breakdown.totalInvestments}`);
      console.log(`- Boost Investments: $${breakdown.boostInvestments.total} (${breakdown.boostInvestments.count} transactions)`);
      console.log(`- Subscription Investments: $${breakdown.subscriptionInvestments.total} (${breakdown.subscriptionInvestments.count} transactions)`);
      console.log(`- Recent Investments (30 days): $${breakdown.recentInvestments.total} (${breakdown.recentInvestments.count} transactions)`);
      
      // Get investment stats for different time periods
      const last7Days = await this.getInvestmentStatsByTime(userId, 7);
      const last30Days = await this.getInvestmentStatsByTime(userId, 30);
      const last90Days = await this.getInvestmentStatsByTime(userId, 90);
      
      console.log("\nInvestment Stats by Time Period:");
      console.log(`- Last 7 days: $${last7Days.totalInvestments} (${last7Days.totalTransactions} transactions)`);
      console.log(`- Last 30 days: $${last30Days.totalInvestments} (${last30Days.totalTransactions} transactions)`);
      console.log(`- Last 90 days: $${last90Days.totalInvestments} (${last90Days.totalTransactions} transactions)`);
      
      return {
        userStats: {
          totalInvested: userStats.totalInvested,
          boostInvestments: userStats.boostInvestments,
          subscriptionInvestments: userStats.subscriptionInvestments,
          totalPayments: userStats.totalPayments
        },
        breakdown,
        timeStats: {
          last7Days,
          last30Days,
          last90Days
        }
      };
      
    } catch (error) {
      logger.error("Error in test investment tracking:", error);
      throw error;
    }
  }
}
