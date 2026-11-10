import { m } from '#/paraglide/messages'
import type { MessageReport } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { formatDateTime } from '#/shared/i18n/format'
import { Badge } from '#/shared/ui/badge'
import { excerpt, personName } from '../model/feed'

export function ReportRow({ report }: { report: MessageReport }) {
  return (
    <div className="relative flex flex-col gap-1">
      <h2 className="font-medium wrap-anywhere">
        <Link variant="stretched" to="/admin/message-reports" search={{ report: report.id }}>
          {m.conversations_report_author({ name: personName(report.author) })}
        </Link>
      </h2>
      <p className="text-sm wrap-anywhere text-muted-foreground">
        {m.conversations_report_reason_line({ reason: excerpt(report.reason, 140) })}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{m.conversations_report_reporter({ name: personName(report.reporter) })}</span>
        <span className="tabular-nums">{formatDateTime(report.created_at_unix)}</span>
        {report.author_banned ? <Badge variant="destructive">{m.conversations_banned_badge()}</Badge> : null}
      </p>
    </div>
  )
}
