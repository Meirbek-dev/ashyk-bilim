// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import { m } from '#/paraglide/messages'
import type { VerifiedCertificate } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'
import { documentTitle } from '#/shared/lib/document-title'

/** The verify page's document head: what a messenger shows for the link printed on the PDF. */
export function certificateHead({ holder, course, certificate }: VerifiedCertificate) {
  const title = m.certificates_og_title({ holder: holder.display_name, course: course.name })
  const description = m.certificates_summary({
    date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }),
  })
  return [
    { title: documentTitle(title) },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
  ]
}

/**
 * The verify routes' head: the certificate's preview, or, for a code that matches none, «Сертификат не найден» in the
 * tab as on the page (not the generic «Страница не найдена»). Any other failure keeps the root's title.
 */
export const verifyHead = ({ loaderData, match }: { loaderData?: VerifiedCertificate; match: { status: string } }) => ({
  meta: loaderData
    ? certificateHead(loaderData)
    : match.status === 'notFound'
      ? [{ title: documentTitle(m.certificates_not_found()) }]
      : [],
})
