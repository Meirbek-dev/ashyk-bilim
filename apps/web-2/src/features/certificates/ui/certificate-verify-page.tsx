import { useSuspenseQuery } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { CourseCover } from '#/shared/components/course-cover'
import { Link } from '#/shared/components/link'
import { ProgressRing } from '#/shared/components/progress-ring'
import { StatusBadge } from '#/shared/components/status-badge'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate, formatPercent } from '#/shared/i18n/format'

import { certificateKind } from '../model/certificates'
import { verificationOptions } from '../queries'
import { CertificatePdfLink } from './certificate-pdf-link'
import { CertificateShare } from './certificate-share'

/**
 * The public answer to "is this certificate real, and whose is it". Both verify URLs render it: the plain one and
 * the `/{ru|kz|en}/...` alias printed on issued PDFs. The facts sit on the course's own cover under a seal with the
 * holder's name large (B-CRT-07): the page an employer opens from a QR code reads as the credential it checks.
 * Course, certificate name and grade are the certificate's own, as issued: a renamed course does not rewrite them.
 */
export function CertificateVerifyPage({ code }: { code: string }) {
  const { data } = useSuspenseQuery(verificationOptions(code))
  const { certificate, certification, course, holder, instructor_name: instructor } = data
  const kind = certificateKind(
    { ...certification.config, certification_name: certificate.certificate_name },
    certificate.course_name,
  )
  const fields = [
    {
      label: m.certificates_course(),
      value: (
        <Link to="/courses/$courseId" params={{ courseId: course.id }}>
          {certificate.course_name}
        </Link>
      ),
    },
    ...(kind ? [{ label: m.certificates_name(), value: kind }] : []),
    ...(instructor ? [{ label: m.certificates_instructor(), value: instructor }] : []),
    ...(certificate.score == null ? [] : [{ label: m.certificates_score(), value: formatPercent(certificate.score) }]),
    { label: m.certificates_code(), value: certificate.verify_code },
  ]
  return (
    <DetailPage
      title={certificate.course_name}
      meta={m.certificates_summary({ date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }) })}
      status={
        <StatusBadge tone="success">
          <BadgeCheck aria-hidden className="size-3" />
          {m.certificates_valid()}
        </StatusBadge>
      }
      primaryAction={
        <div className="flex flex-wrap gap-2">
          <CertificatePdfLink code={certificate.verify_code} variant="default" />
          <CertificateShare
            code={certificate.verify_code}
            name={certificate.certificate_name}
            issuedAtUnix={certificate.issued_at_unix}
          />
        </div>
      }
    >
      <div className="relative isolate overflow-hidden rounded-2xl border px-4 py-10 sm:px-10 sm:py-14">
        <CourseCover seed={course.id} className="absolute inset-0 -z-10 size-full" />
        <div className="mx-auto flex max-w-lg flex-col items-center gap-gutter rounded-xl border bg-card p-gutter text-card-foreground shadow-xs sm:p-8">
          <ProgressRing value={100} tone="stroke-reward" className="size-20">
            <BadgeCheck aria-hidden className="size-8" />
          </ProgressRing>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">{m.certificates_holder()}</p>
            <p className="font-heading text-xl font-semibold wrap-anywhere">{holder.display_name}</p>
          </div>
          <dl className="flex w-full flex-col gap-3 border-t pt-gutter">
            {fields.map(field => (
              <div key={field.label} className="flex flex-col gap-0.5 @md:flex-row @md:gap-6">
                <dt className="shrink-0 text-sm text-muted-foreground @md:w-36">{field.label}</dt>
                <dd className="wrap-anywhere">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </DetailPage>
  )
}
