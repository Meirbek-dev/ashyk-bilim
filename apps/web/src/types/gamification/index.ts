/**
 * Gamification Types - Modular Structure
 *
 * Organized by domain for better maintainability:
 * - errors: Type-safe error handling with discriminated unions
 * - profile: User profiles and level information
 * - transactions: XP awards and transaction history
 * - leaderboard: Rankings and competitive features
 * - preferences: User settings and customization
 * - customization: Avatar frames and accessories
 * - dashboard: Aggregate views and summaries
 */

// Re-export all types from domain modules
export * from './errors'
export * from './profile'
export * from './transactions'
export type * from './leaderboard'
export * from './preferences'
export * from './customization'
export type * from './dashboard'

// Streak type (used across modules)
export type StreakType = 'login' | 'learning'
