import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'

import { CertificatePdfLink, CertificateShare, certificateKind, certificateTitle } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'
import { formatDate } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'

import { certificatesOptions } from '../queries'
import { CodeKeptWhole } from './code-kept-whole'

/** Every certificate the caller holds: the course, when and by whom, the PDF and its public verify page. */
export function MyCertificates() {
  const query = useSuspenseInfiniteQuery(certificatesOptions())
  return (
    <section aria-labelledby="my-certificates" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="my-certificates" className="text-xl font-semibold">
          {m.learning_certificates_title()}
        </h2>
        {/* The profile switch lives in settings (privacy.show_certificates, off by default): one click from here. */}
        {query.data.length > 0 ? (
          <p className="text-sm">
            <Link to="/settings/notifications" hash="achievements">
              {m.learning_certificates_on_profile()}
            </Link>
          </p>
        ) : null}
      </div>
      <ListState
        pending={false}
        error={query.error}
        count={query.data.length}
        filtered={false}
        emptyText={m.learning_certificates_empty()}
        onRetry={() => void query.refetch()}
      >
        <DataList items={query.data} getKey={issued => issued.certificate.id}>
          {({ certificate, certification, course, instructor_name: instructor }) => (
            <>
              <h3 className="font-medium wrap-anywhere">
                <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                  {course.name}
                </Link>
              </h3>
              {certificateKind(certification.config, course.name) ? (
                <p className="text-sm wrap-anywhere">{certificateKind(certification.config, course.name)}</p>
              ) : null}
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
                  <BadgeCheck data-icon="inline-start" aria-hidden />
                  {m.learning_certificate_verify()}
                </RouterLink>
                <CertificateShare
                  code={certificate.verify_code}
                  name={certificateTitle(certification.config, course.name)}
                  issuedAtUnix={certificate.issued_at_unix}
                  linkedIn
                  variant="ghost"
                />
              </div>
            </>
          )}
        </DataList>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
    </section>
  )
}
