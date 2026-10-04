import { describe, expect, test } from 'vite-plus/test'

import { XP_HISTORY_PAGE } from './model/achievements'
import { xpHistoryListOptions } from './queries'

describe('xp history options', () => {
  test('B-ACH-12 the feed reads the history a page at a time and follows next_cursor to the end', () => {
    const options = xpHistoryListOptions()
    expect(options.queryKey[0].query).toEqual({ limit: XP_HISTORY_PAGE })
    expect(options.getNextPageParam({ items: [], next_cursor: 'c1' }, [], undefined, [])).toBe('c1')
    expect(options.getNextPageParam({ items: [], next_cursor: null }, [], undefined, [])).toBeUndefined()
  })
})
