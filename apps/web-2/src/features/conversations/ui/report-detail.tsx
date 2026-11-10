import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { ReportStatus } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDateTime } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import { personName } from '../model/feed'
import { reportOptions } from '../queries'
import { ContextMessage } from './context-message'
import { ResolveDialog } from './resolve-dialog'
import { UnbanDialog } from './unban-dialog'

const statusLabels: Record<ReportStatus, () => string> = {
  open: m.conversations_status_open,
  resolved: m.conversations_status_resolved,
}

/** One report: the text as it was reported, the messages around it, the decision; «Решить» while it is open. */
export function ReportDetail({ reportId }: { reportId: string }) {
  const { data } = useSuspenseQuery(reportOptions(reportId))
  const { report, context } = data
  const back = (
    <RouterLink
      to="/admin/message-reports"
      search={report.status === 'resolved' ? { status: 'resolved' } : {}}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.conversations_report_back()}
    </RouterLink>
  )
  const people = [report.author, report.reporter]
  const action =
    report.status === 'open' ? (
      <ResolveDialog report={report} />
    ) : report.author_banned ? (
      <UnbanDialog report={report} />
    ) : undefined
  return (
    <DetailPage
      back={back}
      title={m.conversations_report_heading({ date: formatDateTime(report.created_at_unix) })}
      status={<Badge variant="outline">{statusLabels[report.status]()}</Badge>}
      meta={`${m.conversations_report_author({ name: personName(report.author) })} · ${m.conversations_report_reporter({ name: personName(report.reporter) })}`}
      primaryAction={action}
    >
      <div className="flex max-w-3xl flex-col gap-gutter">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{m.conversations_report_reason()}</h2>
          <p className="text-sm wrap-anywhere whitespace-pre-wrap">{report.reason}</p>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{m.conversations_report_snapshot()}</h2>
          <div className="border-s-2 ps-3">
            <MarkdownView content={report.body_snapshot} />
          </div>
        </section>
        {report.resolution !== null && report.resolved_at_unix !== null ? (
          <p className="text-sm text-muted-foreground">
            {m.conversations_resolved_line({
              date: formatDateTime(report.resolved_at_unix),
              resolution: report.resolution,
            })}
          </p>
        ) : null}
        {report.status === 'open' && report.author_banned ? <UnbanDialog report={report} /> : null}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{m.conversations_report_context()}</h2>
          <ol className="flex flex-col gap-3">
            {context.map(message => (
              <ContextMessage
                key={message.id}
                message={message}
                people={people}
                reported={message.id === report.message_id}
              />
            ))}
          </ol>
        </section>
      </div>
    </DetailPage>
  )
}
