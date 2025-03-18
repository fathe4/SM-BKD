import { UUID } from "crypto";

export enum ReportedType {
  USER = "user",
  POST = "post",
  COMMENT = "comment",
  MESSAGE = "message",
}

export enum ReportReason {
  SPAM = "spam",
  ABUSE = "abuse",
  INAPPROPRIATE = "inappropriate",
  HARASSMENT = "harassment",
  VIOLENCE = "violence",
  HATE_SPEECH = "hate_speech",
  UNAUTHORIZED_SALES = "unauthorized_sales",
  INTELLECTUAL_PROPERTY = "intellectual_property",
  PRIVACY_VIOLATION = "privacy_violation",
  FALSE_INFORMATION = "false_information",
  OTHER = "other",
}

export enum ReportStatus {
  PENDING = "pending",
  REVIEWED = "reviewed",
  ACTIONED = "actioned",
  DISMISSED = "dismissed",
}

export interface Report {
  id: UUID;
  reporter_id: UUID;
  reported_id: UUID; // User, post, comment ID
  reported_type: ReportedType;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ReportCreate
  extends Omit<Report, "id" | "created_at" | "updated_at" | "status"> {
  status?: ReportStatus;
}

export interface ReportUpdate
  extends Partial<
    Omit<
      Report,
      | "id"
      | "reporter_id"
      | "reported_id"
      | "reported_type"
      | "reason"
      | "created_at"
    >
  > {}

export interface ModerationAction {
  id: UUID;
  report_id: UUID;
  moderator_id: UUID;
  action_taken: string;
  notes?: string;
  created_at: Date;
}

export interface ModerationActionCreate
  extends Omit<ModerationAction, "id" | "created_at"> {}
