// Domain layer
export * from './domain';

// Hooks
export { useAssessment, useAssessmentStudio, useAssessmentAttempt, useAssessmentReview } from './hooks/useAssessment';
export type { UseAssessmentOptions, AssessmentViewModel } from './hooks/useAssessment';

// Registry (loads all kind modules as a side-effect)
export { resolveKindModule, loadKindModule, getLoadedKindModule, registerKind } from './registry/index';
export type { KindModule, KindAuthorProps, KindAttemptProps, KindReviewProps } from './registry/index';

// Shared components
export { default as SubmissionStatusBadge } from './shared/components/SubmissionStatusBadge';
export type { SubmissionStatusBadgeProps } from './shared/components/SubmissionStatusBadge';
