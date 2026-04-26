/**
 * QuestionEditorReducer - State machine for question management
 *
 * Manages UI states for question CRUD operations:
 * - Idle (browsing questions)
 * - Editing inline (adding/editing in place)
 * - Editing modal (dialog-based editing)
 * - Deleting (confirmation flow)
 * - Importing (CSV upload)
 * - Exporting (CSV download)
 *
 * Prevents invalid state combinations (e.g., multiple dialogs open)
 */

export interface Question {
  id?: number;
  question_uuid?: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text?: string; is_correct?: boolean; left?: string; right?: string; option_id?: number }[];
  order_index: number;
}

export type QuestionEditorMode = 'idle' | 'editing-inline' | 'editing-modal' | 'deleting' | 'importing' | 'exporting';

export type QuestionEditorState =
  | { mode: 'idle' }
  | { mode: 'editing-inline'; question: Question }
  | { mode: 'editing-modal'; question: Question }
  | { mode: 'deleting'; questionUuid: string; isDeleting: boolean }
  | { mode: 'importing'; file: File | null }
  | { mode: 'exporting' };

export type QuestionEditorAction =
  | { type: 'START_INLINE_EDIT'; question: Question }
  | { type: 'START_MODAL_EDIT'; question: Question }
  | { type: 'CANCEL_EDIT' }
  | { type: 'START_DELETE'; questionUuid: string }
  | { type: 'CONFIRM_DELETE' }
  | { type: 'CANCEL_DELETE' }
  | { type: 'START_IMPORT'; file: File }
  | { type: 'FINISH_IMPORT' }
  | { type: 'START_EXPORT' }
  | { type: 'FINISH_EXPORT' }
  | { type: 'RESET_TO_IDLE' };

export function questionEditorReducer(state: QuestionEditorState, action: QuestionEditorAction): QuestionEditorState {
  switch (action.type) {
    case 'START_INLINE_EDIT': {
      // Can only start editing from idle state
      if (state.mode !== 'idle') return state;

      return {
        mode: 'editing-inline',
        question: action.question,
      };
    }

    case 'START_MODAL_EDIT': {
      // Can only start editing from idle state
      if (state.mode !== 'idle') return state;

      return {
        mode: 'editing-modal',
        question: action.question,
      };
    }

    case 'CANCEL_EDIT': {
      // Can cancel from any editing mode
      if (state.mode !== 'editing-inline' && state.mode !== 'editing-modal') return state;

      return { mode: 'idle' };
    }

    case 'START_DELETE': {
      // Can only delete from idle state
      if (state.mode !== 'idle') return state;

      return {
        mode: 'deleting',
        questionUuid: action.questionUuid,
        isDeleting: false,
      };
    }

    case 'CONFIRM_DELETE': {
      // Can only confirm from deleting state
      if (state.mode !== 'deleting') return state;

      return {
        ...state,
        isDeleting: true,
      };
    }

    case 'CANCEL_DELETE': {
      // Can only cancel from deleting state
      if (state.mode !== 'deleting') return state;

      return { mode: 'idle' };
    }

    case 'START_IMPORT': {
      // Can only import from idle state
      if (state.mode !== 'idle') return state;

      return {
        mode: 'importing',
        file: action.file,
      };
    }

    case 'FINISH_IMPORT': {
      // Can only finish from importing state
      if (state.mode !== 'importing') return state;

      return { mode: 'idle' };
    }

    case 'START_EXPORT': {
      // Can only export from idle state
      if (state.mode !== 'idle') return state;

      return { mode: 'exporting' };
    }

    case 'FINISH_EXPORT': {
      // Can only finish from exporting state
      if (state.mode !== 'exporting') return state;

      return { mode: 'idle' };
    }

    case 'RESET_TO_IDLE': {
      return { mode: 'idle' };
    }

    default: {
      return state;
    }
  }
}

export function createInitialEditorState(): QuestionEditorState {
  return { mode: 'idle' };
}
