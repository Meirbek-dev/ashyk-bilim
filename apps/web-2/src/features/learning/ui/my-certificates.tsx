import { useSuspenseQuery } from '@tanstack/react-query'

import { CertificatePdfLink } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { formatDate } from '#/shared/i18n/format'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'

import { certificatesOptions } from '../queries'

/** Every certificate the caller holds: the course, when and by whom, the PDF and its public verify page. */
export function MyCertificates() {
  const query = useSuspenseQuery(certificatesOptions())
  return (
    <section aria-labelledby="my-certificates" className="flex flex-col gap-4">
      <h2 id="my-certificates" className="text-xl font-semibold">
        {m.learning_certificates_title()}
      </h2>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={false}
        emptyText={m.learning_certificates_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataList items={query.data} getKey={issued => issued.certificate.id}>
          {({ certificate, course, instructor_name: instructor }) => (
            <>
              <h3 className="font-medium wrap-anywhere">
                <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                  {course.name}
                </Link>
              </h3>
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {m.learning_certificate_meta({
                  date: formatDate(certificate.issued_at_unix),
                  code: certificate.verify_code,
                })}
              </p>
              {instructor ? (
                <p className="text-sm text-muted-foreground">
                  {m.learning_certificate_instructor({ name: instructor })}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <CertificatePdfLink code={certificate.verify_code} />
                <Link
                  to="/certificates/$certificateId/verify"
                  params={{ certificateId: certificate.verify_code }}
                  variant="ghost"
                >
                  {m.learning_certificate_verify()}
                </Link>
              </div>
            </>
          )}
        </DataList>
      </ListState>
    </section>
  )
}
