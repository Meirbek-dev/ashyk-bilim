import { createIsomorphicFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'

import { cookieMaxAge, cookieName, getLocale, serverAsyncLocalStorage, type Locale } from '#/paraglide/runtime'

import { fromPath } from './printed-locale'

/**
 * A signed-in user's language is the one in their profile (the profile menu and settings save it there): a page
 * rendered on the server for them speaks it, and the `ab_locale` cookie follows so hydration and later pages agree.
 * That is how a sign-in on another device or through Google lands in the user's language. The printed certificate
 * URL keeps the certificate's language (strategy `custom-printed`).
 */
export const applyProfileLanguage = createIsomorphicFn()
  .server((language: Locale, href: string) => {
    if (getLocale() === language || fromPath(new URL(href).pathname) !== undefined) return
    const store = serverAsyncLocalStorage?.getStore()
    if (store) store.locale = language
    setCookie(cookieName, language, { path: '/', maxAge: cookieMaxAge, sameSite: 'lax' })
  })
  .client(() => undefined)
