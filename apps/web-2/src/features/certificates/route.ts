// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import { m } from '#/paraglide/messages'
import type { Locale } from '#/paraglide/runtime'
import type { VerifiedCertificate } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'

/** The language prefixes the server prints on PDFs (`Language::web_prefix`; `kz` is the kk interface). */
const PRINTED_LOCALES = new Map<string, Locale>([
  ['ru', 'ru'],
  ['kz', 'kk'],
  ['en', 'en'],
])

/** The interface locale of a printed prefix; null for anything else (that URL does not exist). */
export const printedLocale = (prefix: string): Locale | null => PRINTED_LOCALES.get(prefix) ?? null

/** The verify page's document head: what a messenger shows for the link printed on the PDF. */
export function certificateHead({ holder, course, certificate }: VerifiedCertificate) {
  const title = m.certificates_og_title({ holder: holder.display_name, course: course.name })
  const description = m.certificates_summary({ date: formatDate(certificate.issued_at_unix) })
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
  ]
}
