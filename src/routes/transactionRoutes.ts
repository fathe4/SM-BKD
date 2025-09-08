import { Router } from "express";
import { TransactionController } from "../controllers/transactionController";
import { authenticate } from "../middlewares/authenticate";
import { requireRoles } from "../middlewares/adminAuth";
import { UserRole } from "../types/models";


const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route GET /api/transactions/user/:userId
 * @desc Get payments for a specific user
 * @access Private (User can access their own, Admin can access any)
 */
router.get("/user/:userId", TransactionController.getUserPayments);

/**
 * @route GET /api/transactions/user
 * @desc Get payments for the authenticated user
 * @access Private
 */
router.get("/user", TransactionController.getUserPayments);

/**
 * @route GET /api/transactions
 * @desc Get all payments (admin only)
 * @access Private (Admin only)
 */
router.get("/", requireRoles([UserRole.ADMIN]), TransactionController.getAllPayments);

/**
 * @route GET /api/transactions/:paymentId
 * @desc Get a specific payment by ID
 * @access Private (User can access their own, Admin can access any)
 */
router.get("/:paymentId", TransactionController.getPaymentById);

/**
 * @route GET /api/transactions/user/:userId/summary
 * @desc Get payment summary for a specific user
 * @access Private (User can access their own, Admin can access any)
 */
router.get("/user/:userId/summary", TransactionController.getPaymentSummary);

/**
 * @route GET /api/transactions/user/summary
 * @desc Get payment summary for the authenticated user
 * @access Private
 */
router.get("/user/summary", TransactionController.getPaymentSummary);

/**
 * @route GET /api/transactions/admin/statistics
 * @desc Get payment statistics (admin only)
 * @access Private (Admin only)
 */
router.get("/admin/statistics", requireRoles([UserRole.ADMIN]), TransactionController.getPaymentStatistics);

/**
 * @route PATCH /api/transactions/:paymentId/status
 * @desc Update payment status
 * @access Private (Admin only)
 */
router.patch("/:paymentId/status", requireRoles([UserRole.ADMIN]), TransactionController.updatePaymentStatus);

export default router;
