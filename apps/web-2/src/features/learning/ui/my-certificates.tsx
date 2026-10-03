import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { CertificatePdfLink } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { formatDate } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

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
                <RouterLink
                  to="/certificates/$certificateId/verify"
                  params={{ certificateId: certificate.verify_code }}
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  {m.learning_certificate_verify()}
                </RouterLink>
              </div>
            </>
          )}
        </DataList>
      </ListState>
    </section>
  )
}
