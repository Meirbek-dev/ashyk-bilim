import { m } from '#/paraglide/messages'
import type { MetricCard } from '#/shared/api/gen/types.gen'
import { KpiTile } from '#/shared/ui/charts/kpi-tile'
import { Link } from '#/shared/ui/link'

import type { TileMetric } from '../model/filters'
import { metricChange, metricValue } from './kpi'

type MetricTileProps = {
  label: string
  card: MetricCard
  /** The rows behind the number open below the tiles (`?metric=`, page 1). */
  drill?: TileMetric | undefined
}

/** A server KPI card as a tile: value, change against the previous period, and its drill-through link. */
export function MetricTile({ label, card, drill }: MetricTileProps) {
  const change = metricChange(card)
  return (
    <KpiTile
      label={label}
      value={metricValue(card)}
      change={change?.text}
      tone={change?.tone}
      action={
        drill ? (
          <Link to="." search={prev => ({ ...prev, metric: drill, page: 1 })}>
            {m.analytics_show_rows()}
          </Link>
        ) : null
      }
    />
  )
}
