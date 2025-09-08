import { Request, Response } from "express";
import { TransactionService, PaymentFilters } from "../services/transactionService";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

/**
 * Controller for transaction-related operations
 */
export class TransactionController {
  /**
   * Get user payments with filtering
   */
  static async getUserPayments(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId || req.user?.id;
      
      if (!userId) {
        throw new AppError("User ID is required", 400);
      }

      const filters: PaymentFilters = {
        status: req.query.status as string,
        referenceType: req.query.referenceType as string,
        paymentMethod: req.query.paymentMethod as string,
        currency: req.query.currency as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sortBy: (req.query.sortBy as "created_at" | "amount" | "status") || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
      };

      const payments = await TransactionService.getUserPayments(userId, filters);

      res.status(200).json({
        success: true,
        data: payments,
        count: payments.length,
      });
    } catch (error) {
      logger.error("Error in getUserPayments controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Get all payments (admin only) with filtering
   */
  static async getAllPayments(req: Request, res: Response): Promise<void> {
    try {
      const filters: PaymentFilters = {
        userId: req.query.userId as string,
        status: req.query.status as string,
        referenceType: req.query.referenceType as string,
        paymentMethod: req.query.paymentMethod as string,
        currency: req.query.currency as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 100,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sortBy: (req.query.sortBy as "created_at" | "amount" | "status") || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
      };

      const payments = await TransactionService.getAllPayments(filters);

      res.status(200).json({
        success: true,
        data: payments,
        count: payments.length,
      });
    } catch (error) {
      logger.error("Error in getAllPayments controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Get payment by ID
   */
  static async getPaymentById(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const userId = req.user?.id; // Optional for admin access

      if (!paymentId) {
        throw new AppError("Payment ID is required", 400);
      }

      const payment = await TransactionService.getPaymentById(paymentId, userId);

      if (!payment) {
        throw new AppError("Payment not found", 404);
      }

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      logger.error("Error in getPaymentById controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Get payment summary for a user
   */
  static async getPaymentSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId || req.user?.id;
      const { dateFrom, dateTo } = req.query;

      if (!userId) {
        throw new AppError("User ID is required", 400);
      }

      const summary = await TransactionService.getPaymentSummary(
        userId,
        dateFrom as string,
        dateTo as string
      );

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error("Error in getPaymentSummary controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Get payment statistics (admin only)
   */
  static async getPaymentStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { dateFrom, dateTo } = req.query;

      const statistics = await TransactionService.getPaymentStatistics(
        dateFrom as string,
        dateTo as string
      );

      res.status(200).json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error("Error in getPaymentStatistics controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { status, transactionId, completedAt } = req.body;

      if (!paymentId) {
        throw new AppError("Payment ID is required", 400);
      }

      if (!status) {
        throw new AppError("Status is required", 400);
      }

      const payment = await TransactionService.updatePaymentStatus(
        paymentId,
        status,
        transactionId,
        completedAt
      );

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      logger.error("Error in updatePaymentStatus controller:", error);
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof AppError ? error.message : "Internal server error";
      
      res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }
}
