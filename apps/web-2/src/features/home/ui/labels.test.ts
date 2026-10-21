import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'

import { resultStatus } from './labels'

const label = (kind: 'grade_published' | 'submission_returned', passed: boolean | null) => {
  const status = resultStatus({ kind, passed })
  return [status.label(), status.tone]
}

test('B-HOME-05 a released grade says passed or not; a grade with no passing score and returned work keep their kind', () => {
  expect(label('grade_published', true)).toEqual([m.home_state_passed(), 'success'])
  expect(label('grade_published', false)).toEqual([m.home_state_failed(), 'destructive'])
  expect(label('grade_published', null)).toEqual([m.home_result_published(), 'success'])
  expect(label('submission_returned', null)).toEqual([m.home_result_returned(), 'warning'])
})
