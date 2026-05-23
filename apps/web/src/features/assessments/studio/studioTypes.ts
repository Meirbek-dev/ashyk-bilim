import type { AssessmentItem } from '@/features/assessments/domain/items';

export type StudioTab = 'SETUP' | 'BUILDER' | 'ACCESS' | 'RESULTS' | 'PUBLISH';

export interface AssessmentEditorState {
  title: string;
  description: string;
  dueAt: string;
  gradingType: 'NUMERIC' | 'PERCENTAGE';
  maxAttempts: string;
  timeLimitMinutes: string;
  copyPasteProtection: boolean;
  tabSwitchDetection: boolean;
  devtoolsDetection: boolean;
  rightClickDisable: boolean;
  fullscreenEnforcement: boolean;
  violationThreshold: string;
  allowResultReview: boolean;
  showCorrectAnswers: boolean;
  /** 0–100 — minimum score to pass. Empty string = no threshold. */
  passThreshold: string;
  /** Randomise question order per attempt. */
  randomizeQuestions: boolean;
  /** Randomise option order per attempt. */
  randomizeOptions: boolean;
  /** Allow partial credit for partially-correct multi-select answers. */
  partialCredit: boolean;
  /** Extra minutes after time limit before auto-submit fires. */
  gracePeriodMinutes: string;
  /** ISO datetime-local — when the exam becomes available. */
  availableFrom: string;
  /** 0–100 — percentage of item points deducted for a fully wrong answer (negative marking). Empty string = disabled. */
  negativeMarkingPercent: string;
}

export type EditableItem = Pick<AssessmentItem, 'item_uuid' | 'kind' | 'title' | 'max_score' | 'body'>;
