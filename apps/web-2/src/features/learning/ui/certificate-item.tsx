import { Link as RouterLink } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'

import { CertificateMini, CertificatePdfLink, CertificateShare, certificateKind } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import type { IssuedCertificate } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'

import { CodeKeptWhole } from './code-kept-whole'

/** One held certificate: what it states as issued, the PDF, its verify page and sharing. */
export function CertificateItem({ issued }: { issued: IssuedCertificate }) {
  const { certificate, certification, course, instructor_name: instructor } = issued
  // As issued: a renamed course or an edited template does not rewrite a certificate.
  const kind = certificateKind(
    { ...certification.config, certification_name: certificate.certificate_name },
    certificate.course_name,
  )
  return (
    <div className="flex gap-5 py-1">
      <CertificateMini className="hidden w-28 shrink-0 self-start @xl:flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-lg font-semibold wrap-anywhere">
          <Link to="/courses/$courseId" params={{ courseId: course.id }}>
            {certificate.course_name}
          </Link>
        </h3>
        {kind ? <p className="text-sm wrap-anywhere">{kind}</p> : null}
        <p className="text-sm wrap-anywhere text-muted-foreground">
          <CodeKeptWhole
            text={m.learning_certificate_meta({
              date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }),
              code: certificate.verify_code,
            })}
            code={certificate.verify_code}
          />
        </p>
        {instructor ? (
          <p className="text-sm text-muted-foreground">{m.learning_certificate_instructor({ name: instructor })}</p>
        ) : null}
        <div className="mt-3 -ml-2.5 flex flex-wrap gap-1 @xl:ml-0 @xl:gap-2">
          <CertificatePdfLink code={certificate.verify_code} />
          <RouterLink
            to="/certificates/$certificateId/verify"
            params={{ certificateId: certificate.verify_code }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <BadgeCheck data-icon="inline-start" aria-hidden />
            {m.learning_certificate_verify()}
          </RouterLink>
          <CertificateShare
            code={certificate.verify_code}
            name={certificate.certificate_name}
            issuedAtUnix={certificate.issued_at_unix}
            linkedIn
            variant="ghost"
          />
        </div>
      </div>
    </div>
  )
}
