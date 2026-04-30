/**
 * @deprecated Import from `@/features/assessments/shell` instead.
 *
 * This file is a backwards-compatibility shim.  It re-exports everything from
 * the new canonical shell location so in-tree consumers can migrate at their
 * own pace without a big-bang import update.
 *
 * TODO: Remove this file once all imports are updated to the canonical path.
 * See plans/assessment-system-redesign.md — Phase 1.
 */

export {
  // Layout
  default,
  default as AttemptShell,
} from '@/features/assessments/shell/AssessmentLayout';

export {
  // Control registration hook + types
  useAttemptShellControls,
  AssessmentActionBar as AttemptFooter,
  SaveStateBadge,
  type AttemptSaveState,
  type AttemptShellRegistration,
  type AttemptNavigationState,
  type AttemptRecoveryState,
} from '@/features/assessments/shell/AssessmentActionBar';
