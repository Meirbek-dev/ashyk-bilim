import { expect, test } from 'vite-plus/test'

import { allPages } from './pages'

type Page = { items: number[]; next_cursor: string | null }
const book = new Map<string | undefined, Page>([
  [undefined, { items: [1, 2], next_cursor: 'b' }],
  ['b', { items: [3], next_cursor: 'c' }],
  ['c', { items: [4], next_cursor: null }],
])
const read = async (cursor: string | undefined) => book.get(cursor) ?? { items: [], next_cursor: null }

test('reads every page into one', async () => {
  expect(await allPages(read)).toEqual({ items: [1, 2, 3, 4], next_cursor: null })
})

test('stops at the page cap and keeps the cursor it stopped at', async () => {
  expect(await allPages(read, 2)).toEqual({ items: [1, 2, 3], next_cursor: 'c' })
})
