import type { AnyRouter } from '@tanstack/react-router'

import {
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  getLocale,
  isServer,
  type Locale,
} from '#/paraglide/runtime'

/** The language prefixes the server prints on PDFs (`Language::web_prefix`; `kz` is the kk interface). */
const PRINTED_LOCALES = new Map<string, Locale>([
  ['ru', 'ru'],
  ['kz', 'kk'],
  ['en', 'en'],
])

/** The interface locale of a printed prefix; null for anything else (that URL does not exist). */
export const printedLocale = (prefix: string): Locale | null => PRINTED_LOCALES.get(prefix) ?? null

const PRINTED_PATH = /^\/([a-z]{2})\/certificates\/[^/]+\/verify\/?$/

/** The certificate's language on its printed verify URL; undefined anywhere else (the next strategy decides). */
export const fromPath = (pathname: string) => printedLocale(PRINTED_PATH.exec(pathname)?.[1] ?? '') ?? undefined

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
