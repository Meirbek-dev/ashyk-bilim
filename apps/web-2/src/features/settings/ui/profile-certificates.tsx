import { Award } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ProfileCertificate } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'

/**
 * The certificates the person shows on their profile (B-SET-21), each leading to its public verification page; the
 * section is there only when there is something in it.
 */
export function ProfileCertificates({ certificates }: { certificates: readonly ProfileCertificate[] }) {
  if (certificates.length === 0) return null
  return (
    <section aria-labelledby="profile-certificates" className="flex flex-col gap-3">
      <h2 id="profile-certificates" className="text-xl font-semibold">
        {m.settings_user_certificates()}
      </h2>
      <DataList items={certificates} getKey={certificate => certificate.verify_code}>
        {certificate => (
          <div className="flex items-start gap-3">
            <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-reward" />
            <div className="flex min-w-0 flex-col">
              <h3 className="font-medium wrap-anywhere">
                <Link to="/certificates/$certificateId/verify" params={{ certificateId: certificate.verify_code }}>
                  {certificate.certificate_name}
                </Link>
              </h3>
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {/* The course only when the certificate is named otherwise: «X · выдан» under «X» said it twice. */}
                {certificate.certificate_name === certificate.course_name
                  ? m.settings_user_certificate_issued({
                      date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }),
                    })
                  : m.settings_user_certificate_line({
                      course: certificate.course_name,
                      date: formatDate(certificate.issued_at_unix, undefined, { withYear: true }),
                    })}
              </p>
            </div>
          </div>
        )}
      </DataList>
    </section>
  )
}
