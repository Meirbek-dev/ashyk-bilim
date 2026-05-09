/**
 * AssessmentPolicy — unified policy view model.
 *
 * Aggregates due-date, attempt limit, late penalty, and anti-cheat settings
 * from any assessment type into one shape. Each kind provides a
 * `toPolicyView()` adapter in its registry contribution.
 *
 * Maps directly from backend AssessmentPolicy, including anti_cheat_json.
 */

export interface AntiCheatPolicy {
  /** Block copy/paste inside the attempt surface. */
  copyPasteProtection: boolean;
  /** Detect and count tab switches; auto-submit at threshold. */
  tabSwitchDetection: boolean;
  /** Detect DevTools opening. */
  devtoolsDetection: boolean;
  /** Disable right-click context menu. */
  rightClickDisabled: boolean;
  /** Require fullscreen; exit counts as a violation. */
  fullscreenEnforced: boolean;
  /**
   * Number of violations before auto-submit. null = no auto-submit.
   * Mirrors exam `violation_threshold` and assignment quiz `max_violations`.
   */
  violationThreshold: number | null;
}

export interface LatePolicy {
  /** Penalty applied to the final score when submitted after due_at. */
  penaltyPercent: number;
}

export interface PolicyView {
  /** ISO datetime string or null. */
  dueAt: string | null;
  /** Maximum number of student submissions. null = unlimited. */
  maxAttempts: number | null;
  /** Time limit in seconds. null = unlimited. */
  timeLimitSeconds: number | null;
  latePolicy: LatePolicy;
  antiCheat: AntiCheatPolicy;
}

export const DEFAULT_ANTI_CHEAT_POLICY: AntiCheatPolicy = {
  copyPasteProtection: false,
  tabSwitchDetection: false,
  devtoolsDetection: false,
  rightClickDisabled: false,
  fullscreenEnforced: false,
  violationThreshold: null,
};

export const DEFAULT_POLICY_VIEW: PolicyView = {
  dueAt: null,
  maxAttempts: null,
  timeLimitSeconds: null,
  latePolicy: { penaltyPercent: 0 },
  antiCheat: DEFAULT_ANTI_CHEAT_POLICY,
};

export interface AssessmentPolicyDTO {
  max_attempts?: number | null;
  time_limit_seconds?: number | null;
  due_at?: string | null;
  late_policy_json?: Record<string, unknown> | null;
  late_policy?: Record<string, unknown> | null;
  anti_cheat_json?: Record<string, unknown> | null;
}

export function isAntiCheatEnabled(policy: AntiCheatPolicy): boolean {
  return (
    policy.copyPasteProtection ||
    policy.tabSwitchDetection ||
    policy.devtoolsDetection ||
    policy.rightClickDisabled ||
    policy.fullscreenEnforced
  );
}

export function policyFromAssessmentPolicy(policy: AssessmentPolicyDTO | null | undefined): PolicyView {
  if (!policy) return DEFAULT_POLICY_VIEW;
  const antiCheat = policy.anti_cheat_json ?? {};
  const latePolicy = policy.late_policy_json ?? policy.late_policy ?? {};

  return {
    dueAt: policy.due_at ?? null,
    maxAttempts: typeof policy.max_attempts === 'number' ? policy.max_attempts : null,
    timeLimitSeconds: typeof policy.time_limit_seconds === 'number' ? policy.time_limit_seconds : null,
    latePolicy: {
      penaltyPercent: typeof latePolicy.penalty_percent === 'number' ? latePolicy.penalty_percent : 0,
    },
    antiCheat: {
      copyPasteProtection: Boolean(antiCheat.copy_paste_protection),
      tabSwitchDetection: Boolean(antiCheat.tab_switch_detection),
      devtoolsDetection: Boolean(antiCheat.devtools_detection),
      rightClickDisabled: Boolean(antiCheat.right_click_disable),
      fullscreenEnforced: Boolean(antiCheat.fullscreen_enforcement),
      violationThreshold: typeof antiCheat.violation_threshold === 'number' ? antiCheat.violation_threshold : null,
    },
  };
}
