import { UUID } from "crypto";
import { GeoCoordinates } from "./profile.model";

export enum ListingStatus {
  ACTIVE = "active",
  SOLD = "sold",
  EXPIRED = "expired",
}

export interface MarketplaceListing {
  id: UUID;
  seller_id: UUID;
  title: string;
  description: string;
  price: number;
  category_id: UUID;
  status: ListingStatus;
  images: string[];
  location?: string;
  coordinates?: GeoCoordinates;
  created_at: Date;
  updated_at: Date;
  subscription_tier_id?: UUID;
}

export interface MarketplaceListingCreate
  extends Omit<
    MarketplaceListing,
    "id" | "created_at" | "updated_at" | "status"
  > {
  status?: ListingStatus;
}

export interface MarketplaceListingUpdate
  extends Partial<
    Omit<MarketplaceListing, "id" | "seller_id" | "created_at" | "updated_at">
  > {}

export interface SubscriptionTier {
  id: UUID;
  name: string;
  description: string;
  price: number;
  duration_days: number;
  listing_limit: number;
  featured_listings: boolean;
  priority_search: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionTierCreate
  extends Omit<SubscriptionTier, "id" | "created_at" | "updated_at"> {}

export interface SubscriptionTierUpdate
  extends Partial<Omit<SubscriptionTier, "id" | "created_at" | "updated_at">> {}

export enum PaymentReferenceType {
  BOOST = "boost",
  SUBSCRIPTION = "subscription",
}

export enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
}

export enum Currency {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CAD = "CAD",
  AUD = "AUD",
  JPY = "JPY",
}

export enum PaymentMethod {
  PAYPAL = "paypal",
  STRIPE = "stripe",
  CREDIT_CARD = "credit_card",
  BANK_TRANSFER = "bank_transfer",
}

export interface Payment {
  id: UUID;
  user_id: UUID;
  reference_id: UUID; // Boost or subscription ID
  reference_type: PaymentReferenceType;
  amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  transaction_id?: string;
  created_at: Date;
  completed_at?: Date;
}

export interface PaymentCreate
  extends Omit<Payment, "id" | "created_at" | "completed_at" | "status"> {
  status?: PaymentStatus;
}

export interface PaymentUpdate
  extends Partial<
    Omit<
      Payment,
      | "id"
      | "user_id"
      | "reference_id"
      | "reference_type"
      | "amount"
      | "currency"
      | "created_at"
    >
  > {}

export interface Invoice {
  id: UUID;
  payment_id: UUID;
  user_id: UUID;
  invoice_number: string;
  details: {
    items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
  };
  created_at: Date;
}

export interface InvoiceCreate extends Omit<Invoice, "id" | "created_at"> {}
