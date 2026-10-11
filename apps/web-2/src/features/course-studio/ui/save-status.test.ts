import { expect, test } from 'vite-plus/test'

import { activitySaveState } from './save-status'

test('B-CST-11 a finished question cannot hide another question with unsaved changes', () => {
  expect(activitySaveState({ a: { first: 'saved', second: 'dirty' } }, 'a')).toBe('dirty')
  expect(activitySaveState({ a: { first: 'saved', second: 'saving' } }, 'a')).toBe('saving')
  expect(activitySaveState({ a: { first: 'saved', second: 'failed' } }, 'a')).toBe('failed')
  expect(activitySaveState({ a: { first: 'saved', second: 'saved' } }, 'a')).toBe('saved')
  expect(activitySaveState({ a: { first: 'dirty' } }, 'b')).toBeNull()
})
