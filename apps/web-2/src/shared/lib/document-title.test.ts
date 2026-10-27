import { notFound } from '@tanstack/react-router'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'

import { ogLocale, pageTitle, pageUrl } from './document-title'

const ok = (title?: () => string) => ({ status: 'success', staticData: { title } })
const apiError = (status: number) =>
  new ApiError({ status, code: 'not-found', fieldErrors: [], requestId: null, retryAfter: null })

const missing = (error: unknown, notFoundTitle?: () => string) => ({
  status: 'notFound',
  error,
  staticData: { title: m.platform_page_user, notFoundTitle },
})

describe('pageTitle', () => {
  test('names the deepest titled page, after its section', () => {
    expect(pageTitle([ok(), ok(m.platform_page_user)])).toBe(m.platform_page_user())
    expect(pageTitle([ok(m.collections_title), ok(m.collections_edit_title)])).toBe(
      `${m.collections_edit_title()} · ${m.collections_title()}`,
    )
  })

  // «Пользователь не найден» on the page, «Страница не найдена» in the tab and the history.
  test('B-SET-19 B-CRT-02 a missing object reads in the tab as on its page', () => {
    expect(pageTitle([ok(), missing(notFound(), m.settings_user_not_found)])).toBe(m.settings_user_not_found())
    expect(pageTitle([ok(), missing(apiError(404), m.certificates_not_found)])).toBe(m.certificates_not_found())
    expect(pageTitle([ok(), missing(notFound())])).toBe(m.platform_not_found_title())
    expect(pageTitle([ok(), { ...missing(apiError(403)), status: 'error' }])).toBe(m.platform_forbidden_title())
  })

  // /xx/certificates/<code>/verify: a prefix no certificate prints sends the page's not-found to the root, whose
  // status stays 'success'; the tab says «Страница не найдена» like the page, not «Подлинность сертификата».
  test('B-CRT-06 a not-found handed to the root names the tab as the page it shows', () => {
    const root = { status: 'success', _notFound: true, staticData: {} }
    expect(pageTitle([root, ok(m.platform_page_certificate)])).toBe(m.platform_not_found_title())
  })
})

test('a shared or indexed page names its path without the query, on the public origin, with its language', () => {
  expect(pageUrl('https://bilim.kz', '/courses')).toBe('https://bilim.kz/courses')
  expect(pageUrl('https://bilim.kz', '/courses/')).toBe('https://bilim.kz/courses')
  expect(pageUrl('https://bilim.kz', '/')).toBe('https://bilim.kz/')
  expect(pageUrl('https://bilim.kz', '')).toBe('https://bilim.kz/')
  expect(pageUrl('https://bilim.kz', undefined)).toBe('https://bilim.kz/')
  expect(ogLocale('kk')).toBe('kk_KZ')
  expect(ogLocale('ru')).toBe('ru_RU')
})
