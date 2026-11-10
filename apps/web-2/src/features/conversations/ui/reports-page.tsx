import { useSearch } from '@tanstack/react-router'
import { m } from '#/paraglide/messages'
import type { ReportStatus } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { ListPage } from '#/shared/components/templates/list-page'
import { ReportDetail } from './report-detail'
import { ReportsList } from './reports-list'

/** /admin/message-reports (docs/DIALOGS.md 6): open or decided reports; `?report=` opens one with its context. */
export function ReportsPage() {
  const { status, report } = useSearch({ from: '/_authed/admin/message-reports' })
  if (report) return <ReportDetail reportId={report} />
  const shown: ReportStatus = status ?? 'open'
  const filter = (
    <nav aria-label={m.conversations_reports_filter_label()} className="flex w-full gap-6 overflow-x-auto border-b">
      <Link variant="tab" to="/admin/message-reports" search={{}} activeOptions={{ includeSearch: true }}>
        {m.conversations_reports_open()}
      </Link>
      <Link
        variant="tab"
        to="/admin/message-reports"
        search={{ status: 'resolved' }}
        activeOptions={{ includeSearch: true }}
      >
        {m.conversations_reports_resolved()}
      </Link>
    </nav>
  )
  return (
    <ListPage title={m.conversations_reports_title()} search={filter}>
      <ReportsList status={shown} />
    </ListPage>
  )
}
