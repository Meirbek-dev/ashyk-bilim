import { expect, test } from 'vite-plus/test'

import type { ContinueLearning } from '#/shared/api/gen/types.gen'

import { notStarted } from './continue-hero'

const item = (progress_pct: number | null): ContinueLearning => ({
  activity_id: 'a',
  activity_name: 'Скорость и путь',
  activity_type: 'dynamic',
  course_id: 'c',
  course_name: 'Физика',
  progress_pct,
  thumbnail_key: null,
})

test('B-HOME-01 the hero starts a course nothing was done in («Начать»), and continues one begun', () => {
  expect([null, 0].map(pct => notStarted(item(pct)))).toEqual([true, true])
  expect([0.4, 50].map(pct => notStarted(item(pct)))).toEqual([false, false])
})
