import { m } from '#/paraglide/messages'
import type { StatusTone } from '#/shared/components/status-badge'

import type { Verdict } from '../model/attempt'

export const verdicts: Record<Verdict, { label: () => string; tone: StatusTone }> = {
  correct: { label: m.attempt_correct, tone: 'success' },
  partly: { label: m.attempt_partly, tone: 'warning' },
  wrong: { label: m.attempt_incorrect, tone: 'destructive' },
  skipped: { label: m.attempt_verdict_unanswered, tone: 'neutral' },
}

export const VERDICT_ORDER: Verdict[] = ['correct', 'partly', 'wrong', 'skipped']
