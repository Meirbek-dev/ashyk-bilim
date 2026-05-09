import type { UserGamificationProfile } from './profile';
import * as v from 'valibot';

/**
 * XP Transactions and Award Types
 * Everything related to earning and tracking XP
 */

// XP sources - extensible for future sources
export const XP_SOURCES = {
  ACTIVITY_COMPLETION: 'activity_completion',
  COURSE_COMPLETION: 'course_completion',
  LOGIN_BONUS: 'login_bonus',
  QUIZ_COMPLETION: 'quiz_completion',
  EXAM_COMPLETION: 'exam_completion',
  ASSIGNMENT_SUBMISSION: 'assignment_submission',
  CODE_CHALLENGE_COMPLETION: 'code_challenge_completion',
  CODE_CHALLENGE_FIRST_SOLVE: 'code_challenge_first_solve',
  CODE_CHALLENGE_PERFECT: 'code_challenge_perfect',
  STREAK_BONUS: 'streak_bonus',
  ADMIN_AWARD: 'admin_award',
} as const;

export type XPSource = (typeof XP_SOURCES)[keyof typeof XP_SOURCES];

// XP award request
export interface XPAwardRequest {
  source: XPSource;
  amount?: number; // Optional, backend uses defaults per source
  source_id?: string; // e.g., activity_uuid, course_uuid
  idempotency_key?: string; // For preventing duplicate awards
}

// XP transaction record
export interface XPTransaction {
  id: number;
  user_id: number;
  amount: number;
  source: XPSource;
  source_id: string | null;
  triggered_level_up: boolean;
  previous_level: number;
  created_at: string; // ISO timestamp
}

// XP award response (includes updated profile)
export interface XPAwardResponse {
  transaction: XPTransaction;
  profile: UserGamificationProfile;
  triggered_level_up: boolean;
  previous_level: number;
}

export const XPAwardRequestSchema = v.object({
  source: v.pipe(v.string(), v.minLength(1)),
  amount: v.optional(v.pipe(v.number(), v.minValue(1))),
  source_id: v.optional(v.string()),
  idempotency_key: v.optional(v.string()),
});

export const XPTransactionSchema = v.object({
  id: v.number(),
  user_id: v.number(),
  amount: v.number(),
  source: v.string(),
  source_id: v.nullable(v.string()),
  triggered_level_up: v.boolean(),
  previous_level: v.number(),
  created_at: v.string(),
});

export const XPAwardResponseSchema = v.object({
  transaction: XPTransactionSchema,
  profile: v.any(), // Import would create circular dependency; validate separately
  triggered_level_up: v.boolean(),
  previous_level: v.number(),
});
