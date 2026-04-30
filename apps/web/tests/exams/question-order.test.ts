import { describe, expect, it } from 'vitest';

import { getOrderedExamQuestions } from '@/features/assessments/registry/exam/questionOrder';

const questions = [
  { id: 10, question_uuid: 'question_alpha', question_text: 'Alpha', order_index: 1 },
  { id: 20, question_uuid: 'question_beta', question_text: 'Beta', order_index: 0 },
  { id: 30, question_uuid: 'question_gamma', question_text: 'Gamma', order_index: 2 },
];

describe('getOrderedExamQuestions', () => {
  it('orders questions by numeric attempt question ids', () => {
    const ordered = getOrderedExamQuestions(questions, [30, 10]);

    expect(ordered.map((question) => question.question_text)).toEqual(['Gamma', 'Alpha']);
  });

  it('matches string ids from JSON persisted attempts', () => {
    const ordered = getOrderedExamQuestions(questions, ['20', '30']);

    expect(ordered.map((question) => question.question_text)).toEqual(['Beta', 'Gamma']);
  });

  it('can match question UUIDs when the attempt order uses UUIDs', () => {
    const ordered = getOrderedExamQuestions(questions, ['question_beta', 'alpha']);

    expect(ordered.map((question) => question.question_text)).toEqual(['Beta', 'Alpha']);
  });

  it('falls back to available questions instead of returning an empty exam', () => {
    const ordered = getOrderedExamQuestions(questions, []);

    expect(ordered.map((question) => question.question_text)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('falls back when none of the attempt order ids match fetched questions', () => {
    const ordered = getOrderedExamQuestions(questions, [999, 888]);

    expect(ordered.map((question) => question.question_text)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });
});
