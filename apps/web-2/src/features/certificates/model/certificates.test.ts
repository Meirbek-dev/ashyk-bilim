import { expect, test } from 'vite-plus/test'

import { printedLocale } from '../route'

test('B-CRT-06 the printed prefixes map to interface locales (kz is kk); anything else is no URL', () => {
  expect(printedLocale('ru')).toBe('ru')
  expect(printedLocale('kz')).toBe('kk')
  expect(printedLocale('en')).toBe('en')
  expect(printedLocale('kk')).toBeNull()
  expect(printedLocale('locale')).toBeNull()
  expect(printedLocale('constructor')).toBeNull()
})
