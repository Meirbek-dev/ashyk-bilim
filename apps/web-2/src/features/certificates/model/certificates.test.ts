import { expect, test } from 'vite-plus/test'

import { fromPath, printedLocale } from '#/shared/i18n/printed-locale'

import { certificateKind, certificatePdfHref } from './certificates'

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

test("B-CRT-01 the certificate is named as its PDF: the author's name and the type, each only when set", () => {
  expect(certificateKind({ certification_name: 'Python', certification_type: 'completion' })).toBe(
    'Python · За завершение курса',
  )
  expect(certificateKind({ certification_name: '  ', certification_type: 'workshop' })).toBe('Семинар')
  expect(certificateKind({})).toBe('')
})

test('B-CRT-04 the PDF link is a relative API path in the interface language', () => {
  expect(certificatePdfHref('AB12-CD34', 'kk')).toBe('/api/v2/certificates/AB12-CD34/pdf?lang=kk')
})
