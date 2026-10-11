import { expect, test } from 'vite-plus/test'

import { fromPath, printedLocale } from '#/shared/i18n/printed-locale'

test('B-CRT-06 the printed prefixes map to interface locales (kz is kk); anything else is no URL', () => {
  expect(printedLocale('ru')).toBe('ru')
  expect(printedLocale('kz')).toBe('kk')
  expect(printedLocale('en')).toBe('en')
  expect(printedLocale('kk')).toBeNull()
  expect(printedLocale('locale')).toBeNull()
  expect(printedLocale('constructor')).toBeNull()
})

test('the printed language applies on the printed verify URL only', () => {
  expect(fromPath('/kz/certificates/AB12-CD34/verify')).toBe('kk')
  expect(fromPath('/en/certificates/AB12-CD34/verify/')).toBe('en')
  expect(fromPath('/certificates/AB12-CD34/verify')).toBeUndefined()
  expect(fromPath('/ru/course/x')).toBeUndefined()
  expect(fromPath('/kz/certificates/AB12-CD34')).toBeUndefined()
})
