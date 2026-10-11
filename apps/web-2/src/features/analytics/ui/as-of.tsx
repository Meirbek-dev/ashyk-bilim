import { m } from '#/paraglide/messages'
import { formatDateTime } from '#/shared/i18n/format'

/** «Данные на <date, time>»: analytics are computed snapshots, not live counts. */
export function AsOf({ at }: { at: number }) {
  return <p className="text-sm text-muted-foreground">{m.analytics_as_of({ time: formatDateTime(at) })}</p>
}
