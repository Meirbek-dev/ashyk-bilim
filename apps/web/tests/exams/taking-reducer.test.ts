import { describe, expect, it } from 'vitest';

import { createInitialTakingState, examTakingReducer } from '@/components/Activities/ExamActivity/state/examTakingReducer';

describe('examTakingReducer', () => {
  it('preserves answers when submitting directly from answering mode', () => {
    const state = createInitialTakingState(2, { 10: 1 }, 0);

    const next = examTakingReducer(state, { type: 'START_SUBMIT' });

    expect(next).toMatchObject({
      mode: 'submitting',
      currentIndex: 2,
      answers: { 10: 1 },
    });
  });

  it('preserves recovered answers when submitting from recovery prompt', () => {
    const state = examTakingReducer(createInitialTakingState(), {
      type: 'SHOW_RECOVERY_PROMPT',
      recoveredAnswers: { 10: [1, 2] },
    });

    const next = examTakingReducer(state, { type: 'START_SUBMIT' });

    expect(next).toMatchObject({
      mode: 'submitting',
      answers: { 10: [1, 2] },
    });
  });
});
