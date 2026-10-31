import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

import type { TagRow } from '../model/graph'
import { conceptStatusMeta } from './labels'

/**
 * What a tag says (B-CON-01): the activity (or «a question of» it), the weight and, unless approved, its status in
 * words (a quiet line: the usual state is not a badge).
 */
export function TagLine({ tag }: { tag: TagRow }) {
  const activity = tag.activity ?? m.concepts_tag_activity_gone()
  return (
    <span className="text-sm wrap-anywhere">
      {tag.question ? m.concepts_tag_question({ activity }) : activity}
      <span className="text-muted-foreground tabular-nums">
        {' · '}
        {m.concepts_tag_weight({ weight: formatNumber(tag.tag.weight) })}
        {tag.status === 'approved' ? null : ` · ${conceptStatusMeta[tag.status].label()}`}
      </span>
    </span>
  )
}
