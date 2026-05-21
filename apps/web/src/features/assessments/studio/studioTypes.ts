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
}

export type EditableItem = Pick<AssessmentItem, 'item_uuid' | 'kind' | 'title' | 'max_score' | 'body'>;
