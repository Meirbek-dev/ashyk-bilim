// Route-level code (validateSearch, search, beforeLoad, loaderDeps, head): the route tree keeps it in the entry
// chunk, so this file imports nothing of the feature (AGENTS.md "Entry chunk").
import { m } from '#/paraglide/messages'
import type { VerifiedCertificate } from '#/shared/api/gen/types.gen'
import { formatDate } from '#/shared/i18n/format'
import { documentTitle } from '#/shared/lib/document-title'

/** The verify page's document head: what a messenger shows for the link printed on the PDF. */
export function certificateHead({ holder, certificate }: VerifiedCertificate) {
  const title = m.certificates_og_title({ holder: holder.display_name, course: certificate.course_name })
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
