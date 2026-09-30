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
} as const

export type GamificationErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES]

// Base error interface
interface BaseGamificationError {
  type: GamificationErrorType
  message: string
  timestamp: string
}

// Specific error types with discriminated unions
export interface NetworkError extends BaseGamificationError {
  type: typeof ERROR_TYPES.NETWORK_ERROR
  statusCode?: number
  retryable: boolean
}

export interface AuthError extends BaseGamificationError {
  type: typeof ERROR_TYPES.AUTH_ERROR
  requiresReauth: boolean
}

export interface DailyLimitExceededError extends BaseGamificationError {
  type: typeof ERROR_TYPES.DAILY_LIMIT_EXCEEDED
  currentXP: number
  dailyLimit: number
  resetTime: string // ISO timestamp when limit resets
}

export interface ValidationError extends BaseGamificationError {
  type: typeof ERROR_TYPES.VALIDATION_ERROR
  field?: string
  validationErrors: {
    field: string
    message: string
  }[]
}

export interface ServerError extends BaseGamificationError {
  type: typeof ERROR_TYPES.SERVER_ERROR
  statusCode: number
  errorCode?: string
}

export interface UnknownError extends BaseGamificationError {
  type: typeof ERROR_TYPES.UNKNOWN_ERROR
  originalError?: unknown
}

// Discriminated union of all error types
export type GamificationError =
  | NetworkError
  | AuthError
  | DailyLimitExceededError
  | ValidationError
  | ServerError
  | UnknownError
