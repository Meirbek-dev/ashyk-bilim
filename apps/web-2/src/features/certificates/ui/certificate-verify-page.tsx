import { useSuspenseQuery } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'

import { verificationOptions } from '../queries'
import { CertificatePdfLink } from './certificate-pdf-link'

/**
 * The public answer to "is this certificate real, and whose is it". Both verify URLs render it: the plain one and
 * the `/{ru|kz|en}/...` alias printed on issued PDFs.
 */
export function CertificateVerifyPage({ code }: { code: string }) {
  const { data } = useSuspenseQuery(verificationOptions(code))
  const { certificate, course, holder, instructor_name: instructor } = data
  const fields = [
    { label: m.certificates_holder(), value: holder.display_name },
    ...(instructor ? [{ label: m.certificates_instructor(), value: instructor }] : []),
    { label: m.certificates_code(), value: certificate.verify_code },
  ]
  return (
    <DetailPage
      title={course.name}
      meta={m.certificates_summary({ date: formatDate(certificate.issued_at_unix) })}
      status={
        <StatusBadge tone="success">
          <BadgeCheck aria-hidden className="size-3" />
          {m.certificates_valid()}
        </StatusBadge>
      }
      primaryAction={<CertificatePdfLink code={certificate.verify_code} variant="default" />}
    >
      <dl className="flex max-w-prose flex-col gap-3">
        {fields.map(field => (
          <div key={field.label} className="flex flex-col gap-1 @md:flex-row @md:gap-6">
            <dt className="shrink-0 text-sm text-muted-foreground @md:w-40">{field.label}</dt>
            <dd className="wrap-anywhere">{field.value}</dd>
          </div>
        ))}
      </dl>
    </DetailPage>
  )
}
