import { describe, expect, test } from 'vite-plus/test'

import { nextCollectionsCursor } from './queries'

describe('collections paging', () => {
  test('B-COL-02 asks for the next page with next_cursor and stops when it is null', () => {
    const cursor = '7f0c1a2e-0000-4000-8000-000000000001'
    expect(nextCollectionsCursor({ items: [], next_cursor: cursor })).toBe(cursor)
    expect(nextCollectionsCursor({ items: [], next_cursor: null })).toBeUndefined()
    expect(nextCollectionsCursor({ items: [] })).toBeUndefined()
  })
})
