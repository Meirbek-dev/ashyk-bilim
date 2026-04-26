export type ExamFlowPhase = 'loading' | 'pre-exam' | 'taking' | 'results' | 'manage' | 'error';

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
  question_order: Array<number | string>;
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

export interface ErrorInfo {
  message: string;
  code?: string;
  retryable?: boolean;
}

export type ExamFlowState =
  | { phase: 'loading' }
  | { phase: 'pre-exam'; exam: ExamData; questions: QuestionData[]; userAttempts: AttemptData[] }
  | { phase: 'taking'; exam: ExamData; questions: QuestionData[]; attempt: AttemptData }
  | { phase: 'results'; exam: ExamData; questions: QuestionData[]; attempt: AttemptData }
  | {
      phase: 'reviewing';
      exam: ExamData;
      questions: QuestionData[];
      attempt: AttemptData;
      returnPhase: 'pre-exam' | 'manage';
    }
  | { phase: 'manage'; exam: ExamData; questions: QuestionData[]; userAttempts: AttemptData[] }
  | { phase: 'error'; error: ErrorInfo };

export type ExamFlowAction =
  | { type: 'SET_LOADING' }
  | {
      type: 'SET_PRE_EXAM';
      payload: { exam: ExamData; questions: QuestionData[]; userAttempts: AttemptData[] };
    }
  | { type: 'START_EXAM'; payload: { attempt: AttemptData } }
  | { type: 'SUBMIT_EXAM'; payload: { attempt: AttemptData } }
  | { type: 'VIEW_RESULTS'; payload: { attempt: AttemptData } }
  | {
      type: 'REVIEW_ATTEMPT';
      payload: { attempt: AttemptData; returnPhase: 'pre-exam' | 'manage' };
    }
  | { type: 'EXIT_REVIEW' }
  | { type: 'BACK_TO_PRE_EXAM'; payload: { userAttempts: AttemptData[] } }
  | { type: 'ENTER_MANAGEMENT_MODE' }
  | { type: 'EXIT_MANAGEMENT_MODE'; payload: { userAttempts: AttemptData[] } }
  | { type: 'SET_ERROR'; payload: { error: ErrorInfo } }
  | { type: 'RETRY' };

export function examFlowReducer(state: ExamFlowState, action: ExamFlowAction): ExamFlowState {
  switch (action.type) {
    case 'SET_LOADING': {
      return { phase: 'loading' };
    }

    case 'SET_PRE_EXAM': {
      return {
        phase: 'pre-exam',
        exam: action.payload.exam,
        questions: action.payload.questions,
        userAttempts: action.payload.userAttempts,
      };
    }

    case 'START_EXAM': {
      // Allow starting an exam from pre-exam, management mode, or results (retry flow)
      if (state.phase !== 'pre-exam' && state.phase !== 'manage' && state.phase !== 'results') {
        console.warn('Cannot start exam from phase:', state.phase);
        return state;
      }
      return {
        phase: 'taking',
        exam: state.exam,
        questions: state.questions,
        attempt: action.payload.attempt,
      };
    }

    case 'SUBMIT_EXAM': {
      if (state.phase !== 'taking') {
        console.warn('Cannot submit exam from phase:', state.phase);
        return state;
      }
      return {
        phase: 'results',
        exam: state.exam,
        questions: state.questions,
        attempt: action.payload.attempt,
      };
    }

    case 'VIEW_RESULTS': {
      if (state.phase !== 'pre-exam' && state.phase !== 'manage') {
        console.warn('Cannot view results from phase:', state.phase);
        return state;
      }
      return {
        phase: 'results',
        exam: state.exam,
        questions: state.questions,
        attempt: action.payload.attempt,
      };
    }

    case 'REVIEW_ATTEMPT': {
      if (state.phase !== 'pre-exam' && state.phase !== 'manage') {
        console.warn('Cannot review attempt from phase:', state.phase);
        return state;
      }
      return {
        phase: 'reviewing',
        exam: state.exam,
        questions: state.questions,
        attempt: action.payload.attempt,
        returnPhase: action.payload.returnPhase,
      };
    }

    case 'EXIT_REVIEW': {
      if (state.phase !== 'reviewing') {
        console.warn('Cannot exit review from phase:', state.phase);
        return state;
      }
      if (state.returnPhase === 'pre-exam') {
        return {
          phase: 'pre-exam',
          exam: state.exam,
          questions: state.questions,
          userAttempts: [],
        };
      } else {
        return {
          phase: 'manage',
          exam: state.exam,
          questions: state.questions,
          userAttempts: [],
        };
      }
    }

    case 'BACK_TO_PRE_EXAM': {
      if (state.phase !== 'results' && state.phase !== 'manage') {
        console.warn('Cannot go back to pre-exam from phase:', state.phase);
        return state;
      }
      return {
        phase: 'pre-exam',
        exam: state.exam,
        questions: state.questions,
        userAttempts: action.payload.userAttempts,
      };
    }

    case 'ENTER_MANAGEMENT_MODE': {
      if (state.phase !== 'pre-exam') {
        console.warn('Cannot enter management mode from phase:', state.phase);
        return state;
      }
      return {
        phase: 'manage',
        exam: state.exam,
        questions: state.questions,
        userAttempts: state.userAttempts,
      };
    }

    case 'EXIT_MANAGEMENT_MODE': {
      if (state.phase !== 'manage') {
        console.warn('Cannot exit management mode from phase:', state.phase);
        return state;
      }
      return {
        phase: 'pre-exam',
        exam: state.exam,
        questions: state.questions,
        userAttempts: action.payload.userAttempts,
      };
    }

    case 'SET_ERROR': {
      return {
        phase: 'error',
        error: action.payload.error,
      };
    }

    case 'RETRY': {
      if (state.phase !== 'error') {
        console.warn('Cannot retry from phase:', state.phase);
        return state;
      }
      return { phase: 'loading' };
    }

    default: {
      return state;
    }
  }
}
