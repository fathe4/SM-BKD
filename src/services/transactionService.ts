import { supabase, supabaseAdmin } from "../config/supabase";
import { Tables, TablesInsert, TablesUpdate } from "../types/supabase";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

// Type definitions for payments
export type Payment = Tables<"payments">;
export type PaymentInsert = TablesInsert<"payments">;
export type PaymentUpdate = TablesUpdate<"payments">;

// Filter options for payments
export interface PaymentFilters {
  userId?: string;
  status?: string;
  referenceType?: string;
  paymentMethod?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
  sortBy?: "created_at" | "amount" | "status";
  sortOrder?: "asc" | "desc";
}

// Payment summary interface
export interface PaymentSummary {
  totalPayments: number;
  totalAmount: number;
  completedPayments: number;
  pendingPayments: number;
  failedPayments: number;
  currency: string;
  period: {
    from: string;
    to: string;
  };
}

/**
 * Service class for payment-related database operations
 */
export class TransactionService {
  /**
   * Get all payments for a user with filtering options
   */
  static async getUserPayments(
    userId: string,
    filters: PaymentFilters = {}
  ): Promise<Payment[]> {
    try {
      const {
        status,
        referenceType,
        paymentMethod,
        currency,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        limit = 50,
        offset = 0,
        sortBy = "created_at",
        sortOrder = "desc",
      } = filters;

      let query = supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId);

      // Apply filters
      if (status) query = query.eq("status", status);
      if (referenceType) query = query.eq("reference_type", referenceType);
      if (paymentMethod) query = query.eq("payment_method", paymentMethod);
      if (currency) query = query.eq("currency", currency);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo);
      if (minAmount !== undefined) query = query.gte("amount", minAmount);
      if (maxAmount !== undefined) query = query.lte("amount", maxAmount);

      // Apply sorting and pagination
      query = query
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        logger.error("Error fetching user payments:", error);
        throw new AppError("Failed to fetch payments", 500);
      }

      return data || [];
    } catch (error) {
      logger.error("Error in getUserPayments:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch user payments", 500);
    }
  }

  /**
   * Get all payments (admin only) with filtering
   */
  static async getAllPayments(filters: PaymentFilters = {}): Promise<Payment[]> {
    try {
      const {
        userId,
        status,
        referenceType,
        paymentMethod,
        currency,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        limit = 100,
        offset = 0,
        sortBy = "created_at",
        sortOrder = "desc",
      } = filters;

      let query = supabase!.from("payments").select("*");

      // Apply filters
      if (userId) query = query.eq("user_id", userId);
      if (status) query = query.eq("status", status);
      if (referenceType) query = query.eq("reference_type", referenceType);
      if (paymentMethod) query = query.eq("payment_method", paymentMethod);
      if (currency) query = query.eq("currency", currency);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo);
      if (minAmount !== undefined) query = query.gte("amount", minAmount);
      if (maxAmount !== undefined) query = query.lte("amount", maxAmount);

      // Apply sorting and pagination
      query = query
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        logger.error("Error fetching all payments:", error);
        throw new AppError("Failed to fetch payments", 500);
      }

      return data || [];
    } catch (error) {
      logger.error("Error in getAllPayments:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch all payments", 500);
    }
  }

  /**
   * Get payment summary for a user
   */
  static async getPaymentSummary(
    userId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<PaymentSummary> {
    try {
      const payments = await this.getUserPayments(userId, {
        dateFrom,
        dateTo,
        limit: 1000, // Get more records for accurate summary
      });

      const totalPayments = payments.length;
      const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      const completedPayments = payments.filter(p => p.status === "completed").length;
      const pendingPayments = payments.filter(p => p.status === "pending").length;
      const failedPayments = payments.filter(p => p.status === "failed").length;

      return {
        totalPayments,
        totalAmount,
        completedPayments,
        pendingPayments,
        failedPayments,
        currency: "USD", // Assuming USD as default
        period: {
          from: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: dateTo || new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("Error in getPaymentSummary:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch payment summary", 500);
    }
  }

  /**
   * Get a specific payment by ID
   */
  static async getPaymentById(paymentId: string, userId?: string): Promise<Payment | null> {
    try {
      let query = supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Payment not found
        }
        logger.error("Error fetching payment by ID:", error);
        throw new AppError("Failed to fetch payment", 500);
      }

      return data as Payment;
    } catch (error) {
      logger.error("Error in getPaymentById:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch payment", 500);
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(
    paymentId: string,
    status: string,
    transactionId?: string,
    completedAt?: string
  ): Promise<Payment> {
    try {
      const updateData: PaymentUpdate = {
        status,
        ...(transactionId && { transaction_id: transactionId }),
        ...(completedAt && { completed_at: completedAt }),
      };

      const { data, error } = await supabaseAdmin!
        .from("payments")
        .update(updateData)
        .eq("id", paymentId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating payment status:", error);
        throw new AppError(error.message, 400);
      }

      return data as Payment;
    } catch (error) {
      logger.error("Error in updatePaymentStatus:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update payment status", 500);
    }
  }

  /**
   * Get payment statistics (admin only)
   */
  static async getPaymentStatistics(
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    totalPayments: number;
    totalRevenue: number;
    averagePaymentValue: number;
    paymentsByStatus: Record<string, number>;
    revenueByCurrency: Record<string, number>;
  }> {
    try {
      const payments = await this.getAllPayments({
        dateFrom,
        dateTo,
        limit: 10000, // Get all payments for statistics
      });

      const totalPayments = payments.length;
      const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
      const averagePaymentValue = totalPayments > 0 ? totalRevenue / totalPayments : 0;

      const paymentsByStatus = payments.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const revenueByCurrency = payments.reduce((acc, p) => {
        acc[p.currency] = (acc[p.currency] || 0) + p.amount;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalPayments,
        totalRevenue,
        averagePaymentValue,
        paymentsByStatus,
        revenueByCurrency,
      };
    } catch (error) {
      logger.error("Error in getPaymentStatistics:", error);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to fetch payment statistics", 500);
    }
  }
}
