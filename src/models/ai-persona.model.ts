import { UUID } from "crypto";

export interface AIPersona {
  id: UUID;
  user_id: string; // References users.id
  category: string;
  tone: string;
  posting_frequency: number; // Configures daily posting probability
  is_active: boolean;
  last_posted_at?: Date;
  created_at: Date;
}

export interface AIPersonaCreate extends Omit<AIPersona, "id" | "created_at" | "last_posted_at"> {}

export interface AIPersonaUpdate extends Partial<Omit<AIPersona, "id" | "user_id" | "created_at">> {}

export interface JobQueueItem {
  id: UUID;
  type: "like" | "comment";
  payload: any;
  target_user_id?: string;
  run_at: Date;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  last_error?: string;
  created_at: Date;
}

export interface EngagementScoreInput {
  interest: number;
  relationship: number;
  curiosity: number;
  goalAlignment: number;
  novelty: number;
  currentEnergy: number;
  conversationFatigue: number;
  threadSaturation: number;
}

export interface Intent {
  actorId: string;
  action: "POST" | "COMMENT" | "QUOTE";
  targetType?: "post" | "comment" | "news";
  targetId?: string;
  subjectEntityName: string;
  stance: number;
  internalThought: {
    triggeredMemories: string[];
    dominantGoal: string;
    dominantEmotion: { valence: number; arousal: number };
  };
  tone: {
    sarcasm: number;
    optimism: number;
    certainty: number;
    warmth: number;
  };
  length: "short" | "medium" | "long";
  writingStyle?: {
    capitalization?: "none" | "standard" | "all";
    slangUsage?: boolean;
    technicalDepth?: number;
  };
}
