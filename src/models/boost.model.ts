import { UUID } from "crypto";

export enum BoostStatus {
  ACTIVE = "active",
  PAUSE = "pause",
  PENDING_PAYMENT = "pending_payment",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

export interface PostBoost {
  id: UUID;
  post_id: UUID;
  user_id: UUID;
  days: number;
  amount: number;
  estimated_reach: number;
  status: BoostStatus;
  created_at: Date;
  expires_at: Date;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
}

export interface PostBoostCreate
  extends Omit<PostBoost, "id" | "created_at" | "status"> {
  status?: BoostStatus;
}

export interface PostBoostUpdate
  extends Partial<
    Omit<PostBoost, "id" | "post_id" | "user_id" | "created_at">
  > {}

export interface BoostStatistics {
  id: UUID;
  post_id: UUID;
  total_views: number;
  total_engagements: number;
  engagement_rate: number;
  click_through_rate: number;
  cost_per_engagement: number;
  demographics: {
    age_groups: Record<string, number>;
    genders: Record<string, number>;
    locations: Record<string, number>;
  };
  daily_stats: Array<{
    date: string;
    views: number;
    engagements: number;
  }>;
}
