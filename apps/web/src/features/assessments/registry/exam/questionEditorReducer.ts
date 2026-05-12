export interface Question {
  id?: number;
  question_uuid?: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: {
    text?: string;
    is_correct?: boolean;
    left?: string;
    right?: string;
    option_id?: number;
  }[];
  order_index: number;
}

type EditorState =
  | { mode: 'idle' }
  | { mode: 'editing-modal'; question: Question }
  | { mode: 'editing-inline'; question: Question }
  | { mode: 'deleting'; questionUuid: string; isDeleting: boolean };

type EditorAction =
  | { type: 'START_INLINE_EDIT'; question: Question }
  | { type: 'START_MODAL_EDIT'; question: Question }
  | { type: 'START_DELETE'; questionUuid: string }
  | { type: 'CANCEL_DELETE' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'CONFIRM_DELETE' }
  | { type: 'RESET_TO_IDLE' };

export function createInitialEditorState(): EditorState {
  return { mode: 'idle' };
}

export function questionEditorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'START_INLINE_EDIT':
      return { mode: 'editing-inline', question: action.question };
    case 'START_MODAL_EDIT':
      return { mode: 'editing-modal', question: action.question };
    case 'START_DELETE':
      return { mode: 'deleting', questionUuid: action.questionUuid, isDeleting: false };
    case 'CANCEL_DELETE':
      return { mode: 'idle' };
    case 'CANCEL_EDIT':
      return { mode: 'idle' };
    case 'CONFIRM_DELETE':
      if (state.mode === 'deleting') {
        return { ...state, isDeleting: true };
      }
      return state;
    case 'RESET_TO_IDLE':
      return { mode: 'idle' };
    default:
      return state;
  }
}
