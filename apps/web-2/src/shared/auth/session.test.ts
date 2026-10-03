import { describe, expect, test } from 'vite-plus/test'

import { currentSessionQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'

import { sessionOptions } from './session'

describe('sessionOptions', () => {
  // Login, logout and profile edits invalidate or write currentSessionQueryKey(): the root route must read the same.
  test('uses the generated session key', () => {
    expect(sessionOptions().queryKey).toEqual(currentSessionQueryKey())
  })
})
