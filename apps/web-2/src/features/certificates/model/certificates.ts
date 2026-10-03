import { m } from '#/paraglide/messages'
import type { Locale } from '#/paraglide/runtime'
import { client } from '#/shared/api/gen/client.gen'
import type { CertificatePdfData, VerifiedCertificate } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'

/**
 * certificatePdf() is a browser download (the API answers `Content-Disposition: attachment`), not a fetch: the button
 * is a link to its URL. Relative, so it stays same-origin (`vp dev` proxies /api/v2); the path comes from the client.
 */
export const certificatePdfHref = (code: string): string =>
  client.buildUrl<CertificatePdfData>({ url: '/api/v2/certificates/{code}/pdf', path: { code }, baseUrl: '' })

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
