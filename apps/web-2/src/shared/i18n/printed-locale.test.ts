import { describe, expect, test } from 'vite-plus/test'

import { fromHref, printedAlias } from './printed-locale'

describe('fromHref', () => {
  // applyProfileLanguage reads it on every guest page a signed-in user opens: an absolute-URL parse of the router's
  // in-app href threw, and a user whose profile language differed from the cookie got a 500 on / and /login.
  test('B-AUTH-05 reads the router in-app path a guest page is opened at', () => {
    expect(fromHref('/login?redirect=%2Fhome')).toBeUndefined()
    expect(fromHref('/')).toBeUndefined()
    expect(fromHref('/kz/certificates/ABC123/verify?x=1')).toBe('kk')
  })
})

describe('printedAlias', () => {
  test('an old-web spelling of a printed prefix leads to the printed one; the printed form and strangers do not', () => {
    expect(printedAlias('kk')).toBe('kz')
    expect(printedAlias('kk-KZ')).toBe('kz')
    expect(printedAlias('ru-RU')).toBe('ru')
    expect(printedAlias('EN-US')).toBe('en')
    expect(printedAlias('KZ')).toBe('kz')
    expect(printedAlias('kz')).toBeNull()
    expect(printedAlias('ru')).toBeNull()
    expect(printedAlias('xx')).toBeNull()
  })
})
