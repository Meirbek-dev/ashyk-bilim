/**
 * Canonical import point for attempt-guard / policy enforcement.
 *
 * Consumers should import from here rather than from the internal
 * `features/assessments/shared/hooks/useAttemptGuard` path, so the
 * implementation can be moved or replaced without touching every kind module.
 */
export {
  useAttemptGuard,
  type AttemptGuardOptions,
  type AttemptTimerConfig,
} from '@/features/assessments/shared/hooks/useAttemptGuard';
