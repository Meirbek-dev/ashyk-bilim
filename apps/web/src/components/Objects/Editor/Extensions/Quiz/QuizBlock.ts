import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import QuizBlockComponent from './QuizBlockComponent';
import { nodeView } from '@components/Objects/Editor/core';

export interface QuizAnswer {
  answer_id: string;
  answer: string;
  correct: boolean;
}

export interface QuizQuestion {
  question_id: string;
  question: string;
  type: 'multiple_choice' | 'custom_answer';
  answers: QuizAnswer[];
}

export interface QuizBlockAttrs {
  quizId: string | null;
  questions: QuizQuestion[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockQuiz: {
      insertQuizBlock: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockQuiz',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      quizId: {
        default: null,
      },
      questions: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-quiz',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-quiz', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertQuizBlock:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(QuizBlockComponent);
  },
});
