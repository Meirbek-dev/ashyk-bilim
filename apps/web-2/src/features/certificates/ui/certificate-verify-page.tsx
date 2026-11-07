import { useSuspenseQuery } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'
import { Fragment } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { formatDate, formatPercent } from '#/shared/i18n/format'

import { certificateKind } from '../model/certificates'
import { verificationOptions } from '../queries'
import { CertificatePdfLink } from './certificate-pdf-link'
import { CertificateSheet } from './certificate-sheet'
import { CertificateShare } from './certificate-share'

/**
 * The public answer to "is this certificate real, and whose is it". Both verify URLs render it: the plain one and
 * the `/{ru|kz|en}/...` alias printed on issued PDFs. The verdict stands in the margin with the actions; the facts are
 * printed on the sheet, the holder's name largest (B-CRT-07): the page an employer opens from a QR code reads as the
 * document it checks. Course, certificate name and grade are the certificate's own, as issued: a renamed course does
 * not rewrite them.
 */
export function CertificateVerifyPage({ code }: { code: string }) {
  const { data } = useSuspenseQuery(verificationOptions(code))
  const { certificate, certification, course, holder, instructor_name: instructor } = data
  const kind = certificateKind(
    { ...certification.config, certification_name: certificate.certificate_name },
    certificate.course_name,
  )
  const fields = [
    ...(instructor ? [{ label: m.certificates_instructor(), value: instructor }] : []),
    ...(certificate.score == null ? [] : [{ label: m.certificates_score(), value: formatPercent(certificate.score) }]),
    { label: m.certificates_code(), value: <span className="tabular-nums">{certificate.verify_code}</span> },
  ]
  return (
    <section className="@container grid gap-6 pt-2 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:pt-4">
      <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <p className="flex items-center gap-2 font-heading text-xl font-semibold text-success">
          <BadgeCheck aria-hidden className="size-6 shrink-0" />
          {m.certificates_valid()}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <CertificatePdfLink code={certificate.verify_code} variant="default" />
          <CertificateShare
            code={certificate.verify_code}
            name={certificate.certificate_name}
            issuedAtUnix={certificate.issued_at_unix}
          />
        </div>
      </div>
      <CertificateSheet>
        <div className="flex flex-col gap-7 @xl:gap-9">
          <div className="flex flex-col gap-1">
            <p className="font-heading text-xl">{m.certificates_name()}</p>
            {kind ? <p className="text-sm wrap-anywhere opacity-75">{kind}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm opacity-75">{m.certificates_holder()}</p>
            <p className="font-heading text-display font-semibold wrap-anywhere">{holder.display_name}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm opacity-75">{m.certificates_course()}</p>
            <h1 className="text-2xl font-semibold wrap-anywhere">
              <Link variant="title" to="/courses/$courseId" params={{ courseId: course.id }}>
                {certificate.course_name}
              </Link>
            </h1>
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t border-current/25 pt-6">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 text-sm">
            {fields.map(field => (
              <Fragment key={field.label}>
                <dt className="opacity-75">{field.label}</dt>
                <dd className="wrap-anywhere">{field.value}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="text-sm text-pretty opacity-75">
            {m.certificates_summary({ date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }) })}
          </p>
        </div>
      </CertificateSheet>
    </section>
  )
}
