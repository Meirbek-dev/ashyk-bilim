import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'

import { cookieMaxAge, cookieName, getLocale, serverAsyncLocalStorage, type Locale } from '#/paraglide/runtime'

import { fromHref, prefixLocale } from './printed-locale'

/**
 * A signed-in user's language is the one in their profile (the profile menu and settings save it there): a page
 * rendered on the server for them speaks it, and the `ab_locale` cookie follows so hydration and later pages agree.
 * That is how a sign-in on another device or through Google lands in the user's language. The printed certificate
 * URL keeps the certificate's language (strategy `custom-printed`).
 */
export const applyProfileLanguage = createIsomorphicFn()
  .server((language: Locale, href: string) => {
    if (getLocale() === language || fromHref(href) !== undefined) return
    const store = serverAsyncLocalStorage?.getStore()
    if (store) store.locale = language
    setCookie(cookieName, language, { path: '/', maxAge: cookieMaxAge, sameSite: 'lax' })
  })
  .client(() => undefined)

/**
 * An old-web link carried its language in its prefix (`/kz/course/…` was Kazakh). A visitor who never picked a
 * language keeps it on the page the link now moves to; one who picked a language (the `ab_locale` cookie) keeps
 * theirs. Server only: an old link always arrives as a document request.
 */
export const applyLegacyLanguage = createIsomorphicFn()
  .server((pathname: string) => {
    const language = prefixLocale(pathname.split('/')[1] ?? '')
    if (language === null || getCookie(cookieName) !== undefined) return
    setCookie(cookieName, language, { path: '/', maxAge: cookieMaxAge, sameSite: 'lax' })
  })
  .client(() => undefined)
