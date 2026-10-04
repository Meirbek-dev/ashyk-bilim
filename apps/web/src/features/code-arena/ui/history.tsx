import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/ui/button'

import type { CodeItem } from '../model/arena'
import { ARENA_PATH } from './arena-route'
import { AttemptDetail } from './attempt-detail'
import { attemptStatus } from './labels'

type HistoryProps = { attempts: StudentSubmission[]; code: CodeItem; selected: string | undefined }

/**
 * Every attempt, newest first (B-COD-11): number, status, when it was handed in, the score once released. "Code"
 * opens a handed-in attempt in `?submission=` with its result and its code, read only.
 */
export function History({ attempts, code, selected }: HistoryProps) {
  if (attempts.length === 0) return null
  return (
    <section aria-labelledby="code-history" className="flex min-w-0 flex-col gap-2">
      <h2 id="code-history" className="text-xl font-semibold">
        {m.code_history()}
      </h2>
      <ul className="flex flex-col divide-y text-sm">
        {attempts.map(attempt => {
          const status = attemptStatus[attempt.status]
          const open = attempt.id === selected
          return (
            <li key={attempt.id} className="flex min-w-0 flex-col gap-4 py-2">
              <div className="flex min-h-row flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{m.code_attempt({ number: attempt.attempt_number })}</span>
                <span className="text-muted-foreground">
                  {attempt.submitted_at_unix === null
                    ? m.code_not_submitted()
                    : formatDateTime(attempt.submitted_at_unix)}
                </span>
                <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
                {attempt.final_score === null ? null : (
                  <span className="tabular-nums">{formatPercent(attempt.final_score)}</span>
                )}
                {attempt.status === 'draft' ? null : (
                  <RouterLink
                    from={ARENA_PATH}
                    to="."
                    search={previous => ({ ...previous, submission: open ? undefined : attempt.id })}
                    aria-current={open ? 'true' : undefined}
                    aria-label={m.code_attempt_code({ number: attempt.attempt_number })}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {m.code_show_code()}
                  </RouterLink>
                )}
              </div>
              {open ? <AttemptDetail attempt={attempt} code={code} /> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
