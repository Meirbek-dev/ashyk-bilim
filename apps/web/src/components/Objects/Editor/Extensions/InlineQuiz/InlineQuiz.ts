/**
 * InlineQuiz — TipTap node extension for embedding quizzes in lesson content.
 *
 * Replaces the legacy QuizBlock extension. Stores only an assessment_uuid
 * reference; all quiz content is managed through the canonical assessment API.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'

import InlineQuizComponent from './InlineQuizComponent'
import { nodeView } from '@components/Objects/Editor/core/nodeview-types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineQuiz: {
      insertInlineQuiz: () => ReturnType
    }
  }
}

export interface InlineQuizOptions {
  editable: boolean
  activity: { activity_uuid?: string; course_id?: number } | null
}

const InlineQuiz = Node.create<InlineQuizOptions>({
  name: 'inlineQuiz',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      editable: false,
      activity: null,
    }
  },

  addAttributes() {
    return {
      assessmentUuid: {
        default: null,
        parseHTML: element => element.getAttribute('data-assessment-uuid'),
        renderHTML: attributes => ({
          'data-assessment-uuid': attributes.assessmentUuid,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="inline-quiz"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-quiz' })]
  },

  addCommands() {
    return {
      insertInlineQuiz:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: { assessmentUuid: null },
          }),
    }
  },

  addNodeView() {
    return nodeView(InlineQuizComponent)
  },
})

export default InlineQuiz
