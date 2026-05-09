import * as v from 'valibot';

/**
 * Gamification Error Types
 * Discriminated unions for type-safe error handling
 */

// Error type discriminator
export const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type GamificationErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

// Base error interface
interface BaseGamificationError {
  type: GamificationErrorType;
  message: string;
  timestamp: string;
}

// Specific error types with discriminated unions
export interface NetworkError extends BaseGamificationError {
  type: typeof ERROR_TYPES.NETWORK_ERROR;
  statusCode?: number;
  retryable: boolean;
}

export interface AuthError extends BaseGamificationError {
  type: typeof ERROR_TYPES.AUTH_ERROR;
  requiresReauth: boolean;
}

export interface DailyLimitExceededError extends BaseGamificationError {
  type: typeof ERROR_TYPES.DAILY_LIMIT_EXCEEDED;
  currentXP: number;
  dailyLimit: number;
  resetTime: string; // ISO timestamp when limit resets
}

export interface ValidationError extends BaseGamificationError {
  type: typeof ERROR_TYPES.VALIDATION_ERROR;
  field?: string;
  validationErrors: {
    field: string;
    message: string;
  }[];
}

export interface ServerError extends BaseGamificationError {
  type: typeof ERROR_TYPES.SERVER_ERROR;
  statusCode: number;
  errorCode?: string;
}

export interface UnknownError extends BaseGamificationError {
  type: typeof ERROR_TYPES.UNKNOWN_ERROR;
  originalError?: unknown;
}

// Discriminated union of all error types
export type GamificationError =
  | NetworkError
  | AuthError
  | DailyLimitExceededError
  | ValidationError
  | ServerError
  | UnknownError;

export const NetworkErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.NETWORK_ERROR),
  message: v.string(),
  timestamp: v.string(),
  statusCode: v.optional(v.number()),
  retryable: v.boolean(),
});

export const AuthErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.AUTH_ERROR),
  message: v.string(),
  timestamp: v.string(),
  requiresReauth: v.boolean(),
});

export const DailyLimitExceededErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.DAILY_LIMIT_EXCEEDED),
  message: v.string(),
  timestamp: v.string(),
  currentXP: v.number(),
  dailyLimit: v.number(),
  resetTime: v.string(),
});

export const ValidationErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.VALIDATION_ERROR),
  message: v.string(),
  timestamp: v.string(),
  field: v.optional(v.string()),
  validationErrors: v.array(
    v.object({
      field: v.string(),
      message: v.string(),
    }),
  ),
});

export const ServerErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.SERVER_ERROR),
  message: v.string(),
  timestamp: v.string(),
  statusCode: v.number(),
  errorCode: v.optional(v.string()),
});

export const UnknownErrorSchema = v.object({
  type: v.literal(ERROR_TYPES.UNKNOWN_ERROR),
  message: v.string(),
  timestamp: v.string(),
  originalError: v.optional(v.unknown()),
});

export const GamificationErrorSchema = v.variant('type', [
  NetworkErrorSchema,
  AuthErrorSchema,
  DailyLimitExceededErrorSchema,
  ValidationErrorSchema,
  ServerErrorSchema,
  UnknownErrorSchema,
]);

// Type guards for narrowing error types
export function isNetworkError(error: GamificationError): error is NetworkError {
  return error.type === ERROR_TYPES.NETWORK_ERROR;
}

export function isAuthError(error: GamificationError): error is AuthError {
  return error.type === ERROR_TYPES.AUTH_ERROR;
}

export function isDailyLimitExceededError(error: GamificationError): error is DailyLimitExceededError {
  return error.type === ERROR_TYPES.DAILY_LIMIT_EXCEEDED;
}

export function isValidationError(error: GamificationError): error is ValidationError {
  return error.type === ERROR_TYPES.VALIDATION_ERROR;
}

export function isServerError(error: GamificationError): error is ServerError {
  return error.type === ERROR_TYPES.SERVER_ERROR;
}

export function isUnknownError(error: GamificationError): error is UnknownError {
  return error.type === ERROR_TYPES.UNKNOWN_ERROR;
}
