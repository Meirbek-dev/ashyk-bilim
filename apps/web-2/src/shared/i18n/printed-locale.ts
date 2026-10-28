import type { AnyRouter } from '@tanstack/react-router'

import {
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  getLocale,
  isServer,
  type Locale,
  overwriteSetLocale,
  setLocale,
} from '#/paraglide/runtime'

/** The language prefixes the server prints on PDFs (`Language::web_prefix`; `kz` is the kk interface). */
const PRINTED_LOCALES = new Map<string, Locale>([
  ['ru', 'ru'],
  ['kz', 'kk'],
  ['en', 'en'],
])

/** The interface locale of a printed prefix; null for anything else (that URL does not exist). */
export const printedLocale = (prefix: string): Locale | null => PRINTED_LOCALES.get(prefix) ?? null

/** Other spellings the old web accepted for those prefixes (its locale aliases, apps/web/src/proxy.ts), any case. */
const PRINTED_ALIASES = new Map([
  ['kk', 'kz'],
  ['kk-kz', 'kz'],
  ['ru-ru', 'ru'],
  ['en-us', 'en'],
  ['ru', 'ru'],
  ['kz', 'kz'],
  ['en', 'en'],
])

/** The printed prefix an old alias (`/kk/...`, `/ru-RU/...`, `/KZ/...`) stands for; null for the printed form itself. */
export const printedAlias = (prefix: string): string | null => {
  const printed = PRINTED_ALIASES.get(prefix.toLowerCase())
  return printed === undefined || printed === prefix ? null : printed
}

const PRINTED_PATH = /^\/([a-z]{2})\/certificates\/[^/]+\/verify\/?$/

/** The certificate's language on its printed verify URL; undefined anywhere else (the next strategy decides). */
export const fromPath = (pathname: string) => printedLocale(PRINTED_PATH.exec(pathname)?.[1] ?? '') ?? undefined

/** The same for a router `location.href`: the in-app path with its query ("/login?redirect=…"), not an absolute URL. */
export const fromHref = (href: string) => fromPath(new URL(href, 'http://localhost').pathname)

/**
 * `custom-printed`, the first strategy (paraglideOptions): on `/{ru|kz|en}/certificates/{code}/verify` only,
 * the page speaks the certificate's language, read from its URL on the server and in the browser alike, and never
 * writes the visitor's own language (the `ab_locale` cookie). Call once in each entry, before the first render.
 */
export function definePrintedLocaleStrategy(): void {
  if (isServer) {
    defineCustomServerStrategy('custom-printed', {
      getLocale: request => request && fromPath(new URL(request.url).pathname),
    })
    return
  }
  defineCustomClientStrategy('custom-printed', {
    // The document's address, not router state: the router does not exist yet when hydration asks for the locale.
    getLocale: () => fromPath(document.location.pathname),
    // Nothing to store: the URL is the language.
    setLocale: () => undefined,
  })
  // The runtime's first getLocale() in a tab saves the resolved locale through every strategy (`reload: false`),
  // the cookie included: on the printed page that would make the certificate's language the visitor's own.
  const write = setLocale
  overwriteSetLocale((locale, options) => {
    if (options?.reload === false && fromPath(document.location.pathname) !== undefined) return
    return write(locale, options)
  })
}

/**
 * The language a tab was loaded in is the one it shows: a client-side navigation that changes it (off the printed
 * page into the visitor's own language) loads the next page anew instead of mixing both.
 */
export function reloadOnLanguageChange(router: AnyRouter): void {
  if (isServer) return
  const shown = getLocale()
  router.subscribe('onResolved', () => {
    if (getLocale() !== shown) document.location.reload()
  })
}
