import { describe, expect, test } from 'vite-plus/test'

import { formatPercent } from '#/shared/i18n/format'

import { scoreText, verdictText } from './labels'

describe('grading labels', () => {
  test('B-GRD-11 the auto-grader verdict is localized from its code and params; teacher prose is no verdict', () => {
    expect(verdictText({ feedback_code: 'correct', feedback: 'Correct' })).toBe('Верно')
    expect(verdictText({ feedback_code: 'tests-passed', feedback_params: { correct: 2, total: 3 } })).toBe(
      'Код: пройдено 2 из 3',
    )
    expect(verdictText({ feedback: 'Хорошая мысль' })).toBeNull()
  })

  test('B-GRD-22 a score shows at hundredths (99.99 stays 99.99), no score reads as such (BUG-202)', () => {
    // A no-break space, as Intl's percent beside it on the results tab («0 %» and «0%» on one page).
    expect(scoreText(99.99)).toBe('99,99 %')
    expect(scoreText(66.666666)).toBe('66,67 %')
    expect(scoreText(50)).toBe(formatPercent(50))
    expect(scoreText(null)).toBe('Нет оценки')
  })
})
