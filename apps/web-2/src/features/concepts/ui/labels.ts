import { m } from '#/paraglide/messages'
import type { MasteryLevel } from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'

import type { ConceptStatus } from '../model/graph'

type Status = { label: () => string; tone: StatusTone }

/** A concept's or a tag's decision (B-CON-01). */
export const conceptStatusMeta = {
  suggested: { label: m.concepts_status_suggested, tone: 'info' },
  approved: { label: m.concepts_status_approved, tone: 'success' },
  rejected: { label: m.concepts_status_rejected, tone: 'neutral' },
} satisfies Record<ConceptStatus, Status>

/** A mastery level (docs/AI-FIRST.md 3.2), for the class map and the learner's block. */
export const levelMeta = {
  mastered: { label: m.concepts_level_mastered, tone: 'success' },
  learning: { label: m.concepts_level_learning, tone: 'info' },
  struggling: { label: m.concepts_level_struggling, tone: 'warning' },
  not_started: { label: m.concepts_level_not_started, tone: 'neutral' },
} satisfies Record<MasteryLevel, Status>
