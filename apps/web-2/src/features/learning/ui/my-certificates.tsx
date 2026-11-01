import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { certificatesOptions } from '../queries'
import { CertificateItem } from './certificate-item'

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
          {issued => <CertificateItem issued={issued} />}
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
