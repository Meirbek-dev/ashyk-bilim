import * as v from 'valibot'
import { expect, test } from 'vite-plus/test'

import { searchText } from './search-text'

test('a search value the router read as JSON is its text again', () => {
  expect(v.parse(searchText, 'алгебра')).toBe('алгебра')
  expect(v.parse(searchText, 2024)).toBe('2024')
  expect(v.parse(searchText, 123456)).toBe('123456')
  expect(v.parse(searchText, true)).toBe('true')
  expect(v.parse(searchText, null)).toBe('null')
  expect(v.parse(searchText, [1])).toBe('[1]')
  expect(v.parse(searchText, {})).toBe('{}')
})
