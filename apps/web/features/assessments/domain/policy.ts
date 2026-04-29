/**
 * AssessmentPolicy — unified policy view model.
 *
 * Aggregates due-date, attempt limit, late penalty, and anti-cheat settings
 * from any assessment type into one shape. Each kind provides a
 * `toPolicyView()` adapter in its registry contribution.
 *
 * Phase 5 will add AssessmentPolicy.anti_cheat_json to the backend so this
 * shape maps 1:1. For now it is a frontend view model only.
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
  latePolicy: { penaltyPercent: 0 },
  antiCheat: DEFAULT_ANTI_CHEAT_POLICY,
};

export function isAntiCheatEnabled(policy: AntiCheatPolicy): boolean {
  return (
    policy.copyPasteProtection ||
    policy.tabSwitchDetection ||
    policy.devtoolsDetection ||
    policy.rightClickDisabled ||
    policy.fullscreenEnforced
  );
}

/**
 * Build a PolicyView from exam settings JSON.
 * Remove once the exam backend adopts the unified AssessmentPolicy table.
 */
export function policyFromExamSettings(settings: Record<string, unknown>): PolicyView {
  return {
    dueAt: null, // exams have no due_at today
    maxAttempts: typeof settings['attempt_limit'] === 'number' ? settings['attempt_limit'] : null,
    latePolicy: { penaltyPercent: 0 },
    antiCheat: {
      copyPasteProtection: Boolean(settings['copy_paste_protection']),
      tabSwitchDetection: Boolean(settings['tab_switch_detection']),
      devtoolsDetection: Boolean(settings['devtools_detection']),
      rightClickDisabled: Boolean(settings['right_click_disable']),
      fullscreenEnforced: Boolean(settings['fullscreen_enforcement']),
      violationThreshold:
        typeof settings['violation_threshold'] === 'number'
          ? settings['violation_threshold']
          : null,
    },
  };
}
