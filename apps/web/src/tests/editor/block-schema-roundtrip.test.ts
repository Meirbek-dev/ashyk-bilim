import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';

import { createAuthoringEditorExtensions } from '../../components/Objects/Editor/core';

const schema = getSchema(
  createAuthoringEditorExtensions({
    activity_uuid: 'activity_123',
    name: 'Schema activity',
  }),
);

function roundTrip(json: object): object {
  return PMNode.fromJSON(schema, json).toJSON();
}

const serializationCases: Array<{ title: string; doc: object }> = [
  {
    title: 'info callout',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'calloutInfo',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember this.' }] }],
        },
      ],
    },
  },
  {
    title: 'warning callout',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'calloutWarning',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Careful.' }] }],
        },
      ],
    },
  },
  {
    title: 'badge',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'badge',
          attrs: { color: 'sky', emoji: '💡' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key idea' }] }],
        },
      ],
    },
  },
  {
    title: 'button',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'button',
          attrs: { emoji: '🔗', link: 'https://example.com', color: 'blue', alignment: 'left' },
          content: [{ type: 'text', text: 'Visit site' }],
        },
      ],
    },
  },
  {
    title: 'embed object',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockEmbed',
          attrs: {
            embedUrl: 'https://example.com',
            embedCode: null,
            embedType: 'url',
            embedHeight: 300,
            embedWidth: '100%',
            alignment: 'left',
          },
        },
      ],
    },
  },
  {
    title: 'flipcard',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'flipcard',
          attrs: {
            question: 'What is photosynthesis?',
            answer: 'A process plants use to make energy.',
            color: 'blue',
            alignment: 'center',
            size: 'medium',
          },
        },
      ],
    },
  },
  {
    title: 'image block',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockImage',
          attrs: {
            blockObject: {
              block_uuid: 'img-1',
              content: { file_id: 'image', file_format: 'png' },
            },
            size: { width: 420 },
            alignment: 'center',
          },
        },
      ],
    },
  },
  {
    title: 'math equation',
    doc: {
      type: 'doc',
      content: [{ type: 'blockMathEquation', attrs: { math_equation: 'x^2 + y^2 = z^2' } }],
    },
  },
  {
    title: 'pdf block',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockPDF',
          attrs: {
            blockObject: {
              block_uuid: 'pdf-1',
              content: { file_id: 'handout', file_format: 'pdf' },
            },
            size: {
              width: 840,
              height: 640,
            },
          },
        },
      ],
    },
  },
  {
    title: 'quiz block',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockQuiz',
          attrs: {
            quizId: 'quiz-1',
            questions: [
              {
                question_id: 'question-1',
                question: 'What is 2 + 2?',
                type: 'multiple_choice',
                answers: [
                  { answer_id: 'a', answer: '3', correct: false },
                  { answer_id: 'b', answer: '4', correct: true },
                ],
              },
            ],
          },
        },
      ],
    },
  },
  {
    title: 'scenarios block',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'scenarios',
          attrs: {
            title: 'Decision path',
            currentScenarioId: '1',
            scenarios: [
              {
                id: '1',
                text: 'Choose a path',
                options: [{ id: 'opt-1', text: 'Continue', nextScenarioId: null }],
              },
            ],
          },
        },
      ],
    },
  },
  {
    title: 'user block',
    doc: {
      type: 'doc',
      content: [{ type: 'blockUser', attrs: { user_id: 42 } }],
    },
  },
  {
    title: 'video block',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockVideo',
          attrs: {
            blockObject: {
              block_uuid: 'video-1',
              content: { file_id: 'intro', file_format: 'mp4' },
              size: 'medium',
            },
          },
        },
      ],
    },
  },
  {
    title: 'web preview',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'blockWebPreview',
          attrs: {
            url: 'https://example.com',
            title: 'Example',
            description: 'Example description',
            og_image: null,
            favicon: null,
            og_type: 'website',
            og_url: 'https://example.com',
            alignment: 'left',
            buttonLabel: 'Visit',
            showButton: true,
            openInPopup: false,
          },
        },
      ],
    },
  },
];

describe('custom block schema round-trip', () => {
  for (const testCase of serializationCases) {
    it(`preserves ${testCase.title}`, () => {
      expect(roundTrip(testCase.doc)).toEqual(testCase.doc);
    });
  }
});
