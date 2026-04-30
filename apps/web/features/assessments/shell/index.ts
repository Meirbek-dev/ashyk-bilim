/**
 * Canonical exports for the assessment shell.
 *
 * Import from here in all kind modules and app pages — not from the individual
 * sub-files.  This lets us reorganise internals without touching consumers.
 */

// Layout
export { default as AssessmentLayout } from './AssessmentLayout';

// Header
export { AssessmentChrome } from './AssessmentChrome';
export type { AssessmentChromeProps } from './AssessmentChrome';

// Footer + control registration
export { AssessmentActionBar, SaveStateBadge, useAttemptShellControls } from './AssessmentActionBar';
export type {
  AttemptSaveState,
  AttemptShellRegistration,
  AttemptNavigationState,
  AttemptRecoveryState,
} from './AssessmentActionBar';

// Hooks
export { useAssessmentAttempt } from './hooks/useAssessmentAttempt';
export type {
  UseAssessmentAttemptOptions,
  UseAssessmentAttemptReturn,
  PersistedAttemptData,
} from './hooks/useAssessmentAttempt';

export {
  useAttemptGuard,
  type AttemptGuardOptions,
  type AttemptTimerConfig,
} from './hooks/useAssessmentPolicy';
