// LEGACY — types are inlined in ExamAttemptContent.tsx after Phase 1 migration.
// TODO Phase 1: delete once ExamAttemptContent no longer imports this.
// See plans/assessment-system-redesign.md

export interface ExamData {
  exam_uuid: string;
  title: string;
  description: string;
  settings: {
    time_limit?: number;
    attempt_limit?: number;
    shuffle_questions: boolean;
    question_limit?: number;
    access_mode: 'NO_ACCESS' | 'WHITELIST' | 'ALL_ENROLLED';
    allow_result_review: boolean;
    show_correct_answers: boolean;
    copy_paste_protection: boolean;
    tab_switch_detection: boolean;
    devtools_detection: boolean;
    right_click_disable: boolean;
    fullscreen_enforcement: boolean;
    violation_threshold?: number;
  };
  [key: string]: any;
}

export interface AttemptData {
  id: number;
  attempt_uuid: string;
  exam_id: number;
  user_id: number;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
  score: number;
  max_score: number;
  started_at: string;
  finished_at?: string | null;
  question_order: (number | string)[];
  violations: { type: string; timestamp: string }[];
  answers?: Record<number, any>;
  [key: string]: any;
}

export interface QuestionData {
  id: number;
  question_uuid: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text: string; is_correct?: boolean; left?: string; right?: string; option_id?: number }[];
}
