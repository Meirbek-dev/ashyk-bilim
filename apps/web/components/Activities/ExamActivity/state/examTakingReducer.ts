/**
 * ExamTakingReducer - State machine for exam-taking interface
 *
 * Manages complex state transitions during exam attempts:
 * - Navigation between questions
 * - Answer recording and validation
 * - Submission flow with confirmation
 * - Violation warnings and auto-submit
 * - Answer recovery from localStorage
 * - Fullscreen enforcement
 *
 * Prevents invalid state combinations (e.g., navigating while submitting)
 */

export interface Violation {
  type: string;
  count: number;
}

export type ExamTakingMode =
  | 'answering'
  | 'confirming-submit'
  | 'submitting'
  | 'violation-warning'
  | 'recovery-prompt'
  | 'fullscreen-warning';

export type ExamTakingState =
  | {
      mode: 'answering';
      currentIndex: number;
      answers: Record<number, any>;
      violationCount: number;
    }
  | {
      mode: 'confirming-submit';
      currentIndex: number;
      answers: Record<number, any>;
      unansweredQuestions: number[];
      violationCount: number;
    }
  | {
      mode: 'submitting';
      currentIndex: number;
      answers: Record<number, any>;
      violationCount: number;
    }
  | {
      mode: 'violation-warning';
      violation: Violation;
      currentIndex: number;
      answers: Record<number, any>;
      violationCount: number;
    }
  | {
      mode: 'recovery-prompt';
      recoveredAnswers: Record<number, any>;
      currentIndex: number;
      violationCount: number;
    }
  | {
      mode: 'fullscreen-warning';
      currentIndex: number;
      answers: Record<number, any>;
      violationCount: number;
    };

export type ExamTakingAction =
  | { type: 'NAVIGATE_TO_QUESTION'; index: number }
  | { type: 'ANSWER_QUESTION'; questionId: number; answer: any }
  | { type: 'CLEAR_ANSWER'; questionId: number }
  | { type: 'SHOW_SUBMIT_CONFIRMATION'; unansweredQuestions: number[] }
  | { type: 'CANCEL_SUBMIT' }
  | { type: 'START_SUBMIT' }
  | { type: 'RECORD_VIOLATION'; violation: Violation }
  | { type: 'DISMISS_VIOLATION' }
  | { type: 'SHOW_RECOVERY_PROMPT'; recoveredAnswers: Record<number, any> }
  | { type: 'ACCEPT_RECOVERY' }
  | { type: 'REJECT_RECOVERY' }
  | { type: 'SHOW_FULLSCREEN_WARNING' }
  | { type: 'DISMISS_FULLSCREEN_WARNING' }
  | { type: 'RESET_TO_ANSWERING' };

export function examTakingReducer(state: ExamTakingState, action: ExamTakingAction): ExamTakingState {
  switch (action.type) {
    case 'NAVIGATE_TO_QUESTION': {
      // Only allow navigation in answering mode
      if (state.mode !== 'answering') return state;

      return {
        ...state,
        currentIndex: action.index,
      };
    }

    case 'ANSWER_QUESTION': {
      // Can answer in answering or recovery-prompt mode
      if (state.mode !== 'answering' && state.mode !== 'recovery-prompt') return state;

      const baseAnswersForAnswer = state.mode === 'recovery-prompt' ? state.recoveredAnswers : state.answers;

      return {
        ...state,
        mode: 'answering',
        answers: {
          ...baseAnswersForAnswer,
          [action.questionId]: action.answer,
        },
      };
    }

    case 'CLEAR_ANSWER': {
      if (state.mode !== 'answering') return state;

      const newAnswers = { ...state.answers };
      delete newAnswers[action.questionId];

      return {
        ...state,
        answers: newAnswers,
      };
    }

    case 'SHOW_SUBMIT_CONFIRMATION': {
      if (state.mode !== 'answering') return state;

      return {
        mode: 'confirming-submit',
        currentIndex: state.currentIndex,
        answers: state.answers,
        unansweredQuestions: action.unansweredQuestions,
        violationCount: state.violationCount,
      };
    }

    case 'CANCEL_SUBMIT': {
      if (state.mode !== 'confirming-submit') return state;

      return {
        mode: 'answering',
        currentIndex: state.currentIndex,
        answers: state.answers,
        violationCount: state.violationCount,
      };
    }

    case 'START_SUBMIT': {
      if (state.mode === 'submitting') return state;

      const answers = state.mode === 'recovery-prompt' ? state.recoveredAnswers : 'answers' in state ? state.answers : {};
      const currentIndex = 'currentIndex' in state ? state.currentIndex : 0;

      return {
        mode: 'submitting',
        currentIndex,
        answers,
        violationCount: state.violationCount,
      };
    }

    case 'RECORD_VIOLATION': {
      // Can record violations in any mode except submitting
      if (state.mode === 'submitting') return state;

      const baseAnswersForViolation =
        state.mode === 'recovery-prompt' ? state.recoveredAnswers : 'answers' in state ? state.answers : {};

      return {
        mode: 'violation-warning',
        violation: action.violation,
        currentIndex: 'currentIndex' in state ? state.currentIndex : 0,
        answers: baseAnswersForViolation,
        violationCount: action.violation.count,
      };
    }

    case 'DISMISS_VIOLATION': {
      if (state.mode !== 'violation-warning') return state;

      return {
        mode: 'answering',
        currentIndex: state.currentIndex,
        answers: state.answers,
        violationCount: state.violationCount,
      };
    }

    case 'SHOW_RECOVERY_PROMPT': {
      // Only show recovery if in answering mode with no answers yet
      if (state.mode !== 'answering') return state;
      if (Object.keys(state.answers).length > 0) return state;

      return {
        mode: 'recovery-prompt',
        recoveredAnswers: action.recoveredAnswers,
        currentIndex: state.currentIndex,
        violationCount: state.violationCount,
      };
    }

    case 'ACCEPT_RECOVERY': {
      if (state.mode !== 'recovery-prompt') return state;

      return {
        mode: 'answering',
        currentIndex: state.currentIndex,
        answers: state.recoveredAnswers,
        violationCount: state.violationCount,
      };
    }

    case 'REJECT_RECOVERY': {
      if (state.mode !== 'recovery-prompt') return state;

      return {
        mode: 'answering',
        currentIndex: state.currentIndex,
        answers: {},
        violationCount: state.violationCount,
      };
    }

    case 'SHOW_FULLSCREEN_WARNING': {
      if (state.mode !== 'answering') return state;

      return {
        mode: 'fullscreen-warning',
        currentIndex: state.currentIndex,
        answers: state.answers,
        violationCount: state.violationCount,
      };
    }

    case 'DISMISS_FULLSCREEN_WARNING': {
      if (state.mode !== 'fullscreen-warning') return state;

      return {
        mode: 'answering',
        currentIndex: state.currentIndex,
        answers: state.answers,
        violationCount: state.violationCount,
      };
    }

    case 'RESET_TO_ANSWERING': {
      const safeAnswers =
        state.mode === 'recovery-prompt' ? state.recoveredAnswers : 'answers' in state ? state.answers : {};
      return {
        mode: 'answering',
        currentIndex: 'currentIndex' in state ? state.currentIndex : 0,
        answers: safeAnswers,
        violationCount: state.violationCount,
      };
    }

    default: {
      return state;
    }
  }
}

export function createInitialTakingState(
  initialIndex = 0,
  initialAnswers: Record<number, any> = {},
  initialViolationCount = 0,
): ExamTakingState {
  return {
    mode: 'answering',
    currentIndex: initialIndex,
    answers: initialAnswers,
    violationCount: initialViolationCount,
  };
}
