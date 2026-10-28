import * as v from 'valibot'
import { expect, test } from 'vite-plus/test'

import { searchText } from './search-text'

test('a search value the router read as a number or a boolean is text again', () => {
  expect(v.parse(searchText, 'алгебра')).toBe('алгебра')
  expect(v.parse(searchText, 2024)).toBe('2024')
  expect(v.parse(searchText, 123456)).toBe('123456')
  expect(v.parse(searchText, true)).toBe('true')
  expect(v.safeParse(searchText, { a: 1 }).success).toBe(false)
})
