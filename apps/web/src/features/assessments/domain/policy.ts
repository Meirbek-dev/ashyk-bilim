/**
 * AssessmentPolicy — unified policy view model.
 *
 * Aggregates due-date, attempt limit, late penalty, and anti-cheat settings
 * from any assessment type into one shape. Each kind provides a
 * `toPolicyView()` adapter in its registry contribution.
 *
 * Maps directly from backend AssessmentPolicy.canonical_policy.
 */

export interface AntiCheatPolicy {
  /** Block copy/paste inside the attempt surface. */
  copyPasteProtection: boolean
  /** Detect and count tab switches; auto-submit at threshold. */
  tabSwitchDetection: boolean
  /** Detect DevTools opening. */
  devtoolsDetection: boolean
  /** Disable right-click context menu. */
  rightClickDisabled: boolean
  /** Require fullscreen; exit counts as a violation. */
  fullscreenEnforced: boolean
  /**
   * Number of violations before auto-submit. null = no auto-submit.
   * Mirrors timed assessment violation thresholds.
   */
  violationThreshold: number | null
}

export interface LatePolicy {
  /** Penalty applied to the final score when submitted after due_at. */
  penaltyPercent: number
}

export interface PolicyView {
  /** ISO datetime string or null. */
  dueAt: string | null
  /** Maximum number of student submissions. null = unlimited. */
  maxAttempts: number | null
  /** Time limit in seconds. null = unlimited. */
  timeLimitSeconds: number | null
  /** What students may see after submission/release. */
  reviewVisibility: 'NONE' | 'SCORE_ONLY' | 'FULL'
  resultReviewAllowed: boolean
  correctAnswersVisible: boolean
  latePolicy: LatePolicy
  antiCheat: AntiCheatPolicy
}

export interface AssessmentIntegrityPolicyDTO {
  copy_paste_protection?: boolean | null
  tab_switch_detection?: boolean | null
  devtools_detection?: boolean | null
  right_click_disabled?: boolean | null
  fullscreen_required?: boolean | null
  violation_threshold?: number | null
}

export interface AssessmentDeliveryPolicyDTO {
  randomize_questions?: boolean | null
  randomize_options?: boolean | null
  partial_credit?: boolean | null
  negative_marking_percent?: number | null
}

export interface AssessmentCanonicalPolicyDTO {
  max_attempts?: number | null
  time_limit_seconds?: number | null
  due_at?: string | null
  passing_score?: number | null
  review_visibility?: 'NONE' | 'SCORE_ONLY' | 'FULL' | null
  late_policy?: Record<string, unknown> | null
  integrity?: AssessmentIntegrityPolicyDTO | null
  delivery?: AssessmentDeliveryPolicyDTO | null
}

const DEFAULT_ANTI_CHEAT_POLICY: AntiCheatPolicy = {
  copyPasteProtection: false,
  tabSwitchDetection: false,
  devtoolsDetection: false,
  rightClickDisabled: false,
  fullscreenEnforced: false,
  violationThreshold: null,
}

export const DEFAULT_POLICY_VIEW: PolicyView = {
  dueAt: null,
  maxAttempts: null,
  timeLimitSeconds: null,
  reviewVisibility: 'FULL',
  resultReviewAllowed: true,
  correctAnswersVisible: true,
  latePolicy: { penaltyPercent: 0 },
  antiCheat: DEFAULT_ANTI_CHEAT_POLICY,
}

export interface AssessmentPolicyDTO {
  canonical_policy?: AssessmentCanonicalPolicyDTO | null
}

export function isAntiCheatEnabled(policy: AntiCheatPolicy): boolean {
  return (
    policy.copyPasteProtection ||
    policy.tabSwitchDetection ||
    policy.devtoolsDetection ||
    policy.rightClickDisabled ||
    policy.fullscreenEnforced
  )
}

export function policyFromAssessmentPolicy(policy: AssessmentPolicyDTO | null | undefined): PolicyView {
  if (!policy) return DEFAULT_POLICY_VIEW
  const canonical = policy.canonical_policy
  if (!canonical) return DEFAULT_POLICY_VIEW
  const integrity = canonical.integrity ?? {}
  const latePolicy = canonical.late_policy ?? {}
  const reviewVisibility = normalizeReviewVisibility(canonical.review_visibility)

  return {
    dueAt: canonical.due_at ?? null,
    maxAttempts: typeof canonical.max_attempts === 'number' ? canonical.max_attempts : null,
    timeLimitSeconds: typeof canonical.time_limit_seconds === 'number' ? canonical.time_limit_seconds : null,
    reviewVisibility,
    resultReviewAllowed: reviewVisibility !== 'NONE',
    correctAnswersVisible: reviewVisibility === 'FULL',
    latePolicy: {
      penaltyPercent: typeof latePolicy.penalty_percent === 'number' ? latePolicy.penalty_percent : 0,
    },
    antiCheat: {
      copyPasteProtection: integrity.copy_paste_protection === true,
      tabSwitchDetection: integrity.tab_switch_detection === true,
      devtoolsDetection: integrity.devtools_detection === true,
      rightClickDisabled: integrity.right_click_disabled === true,
      fullscreenEnforced: integrity.fullscreen_required === true,
      violationThreshold: typeof integrity.violation_threshold === 'number' ? integrity.violation_threshold : null,
    },
  }
}

function normalizeReviewVisibility(value: unknown): PolicyView['reviewVisibility'] {
  return value === 'NONE' || value === 'SCORE_ONLY' || value === 'FULL' ? value : 'FULL'
}
