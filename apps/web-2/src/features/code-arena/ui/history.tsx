import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'
import { buttonVariants } from '#/shared/components/button-variants'

import type { CodeItem } from '../model/arena'
import { ARENA_PATH } from './arena-route'
import { AttemptDetail } from './attempt-detail'
import { attemptStatus } from './labels'
import { Verdict } from './verdict'

type HistoryProps = { attempts: StudentSubmission[]; code: CodeItem; selected: string | undefined }

/**
 * Every attempt, newest first (B-COD-11): number, status, when it was handed in, the score once released. "Code"
 * opens a handed-in attempt in `?submission=` with its result and its code, read only.
 */
export function History({ attempts, code, selected }: HistoryProps) {
  if (attempts.length === 0) return null
  return (
    <section aria-labelledby="code-history" className="@container flex min-w-0 flex-col gap-3">
      <h2 id="code-history" className="text-xl font-semibold">
        {m.code_history()}
      </h2>
      {/* The same typeset log as the runs: number, date, state, score and «Код» each keep their column. */}
      <ul className="grid divide-y border-y text-sm @md:grid-cols-[max-content_max-content_minmax(0,1fr)_max-content_max-content]">
        {attempts.map(attempt => {
          const status = attemptStatus[attempt.status]
          const open = attempt.id === selected
          return (
            <li
              key={attempt.id}
              className="col-span-full grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_max-content_max-content] items-center gap-x-4 py-1 @md:grid-cols-subgrid"
            >
              <span className="font-medium">{m.code_attempt({ number: attempt.attempt_number })}</span>
              {/* Narrow: the state and the date share the row's second line; wide: each in its own column. */}
              <span className="col-span-3 row-start-2 flex flex-wrap items-center gap-x-4 pb-1.5 @md:contents">
                {/* A draft says so in its state; «not handed in» beside «Draft» only repeats it. */}
                {attempt.submitted_at_unix === null && attempt.status === 'draft' ? null : (
                  <span className="text-muted-foreground tabular-nums @md:col-start-2 @md:row-start-1">
                    {attempt.submitted_at_unix === null
                      ? m.code_not_submitted()
                      : formatDateTime(attempt.submitted_at_unix)}
                  </span>
                )}
                <span className="order-first @md:order-none @md:col-start-3 @md:row-start-1">
                  <Verdict status={status} />
                </span>
              </span>
              {attempt.final_score === null ? null : (
                <span className="col-start-2 row-start-1 justify-self-end font-medium tabular-nums @md:col-start-4">
                  {formatPercent(attempt.final_score)}
                </span>
              )}
              {attempt.status === 'draft' ? null : (
                <RouterLink
                  from={ARENA_PATH}
                  to="."
                  search={previous => ({ ...previous, submission: open ? undefined : attempt.id })}
                  aria-current={open ? 'true' : undefined}
                  aria-label={m.code_attempt_code({ number: attempt.attempt_number })}
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'col-start-3 row-start-1 justify-self-end @md:col-start-5',
                  })}
                >
                  {m.code_show_code()}
                </RouterLink>
              )}
              {open ? (
                <div className="col-span-full row-start-3 min-w-0 pt-3 @md:row-start-2">
                  <AttemptDetail attempt={attempt} code={code} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
