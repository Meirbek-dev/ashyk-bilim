import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'
import { Skeleton } from '#/shared/ui/skeleton'

import type { CodeItem } from '../model/arena'
import { Io } from './io'
import { difficultyLabels } from './labels'

/** The statement (B-COD-03): difficulty, limits, text, formats, constraints and the visible tests as examples. */
export function Problem({ code: { item, body } }: { code: CodeItem }) {
  const samples = (body.tests ?? []).filter(test => test.is_visible !== false)
  const difficulty = item.metadata.difficulty
  const limits = [
    body.time_limit_seconds === null ? null : m.code_limit_time({ seconds: formatNumber(body.time_limit_seconds) }),
    body.memory_limit_mb === null ? null : m.code_limit_memory({ mb: formatNumber(body.memory_limit_mb) }),
  ].filter(text => text !== null)
  const parts = [
    { title: m.code_input_spec(), text: body.input_spec ?? '' },
    { title: m.code_output_spec(), text: body.output_spec ?? '' },
  ].filter(part => part.text !== '')
  return (
    <section aria-labelledby="code-problem" className="flex max-w-prose min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="code-problem" className="text-xl font-semibold">
          {m.code_problem()}
        </h2>
        {difficulty ? <StatusBadge tone="neutral">{difficultyLabels[difficulty]()}</StatusBadge> : null}
      </div>
      {limits.length > 0 ? <p className="text-sm text-muted-foreground">{limits.join(' · ')}</p> : null}
      <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
        {body.prompt ? <MarkdownView content={body.prompt} /> : null}
        {parts.map(part => (
          <div key={part.title} className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{part.title}</h3>
            <MarkdownView content={part.text} />
          </div>
        ))}
      </Suspense>
      {body.constraints && body.constraints.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{m.code_constraints()}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {body.constraints.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {samples.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{m.code_samples()}</h3>
          <ol className="flex flex-col gap-4">
            {samples.map((test, index) => (
              <li key={test.id} className="flex flex-col gap-2">
                <p className="text-sm font-medium">{test.description ?? m.code_sample({ number: index + 1 })}</p>
                <Io label={m.code_io_input()} text={test.input ?? ''} />
                <Io label={m.code_io_expected()} text={test.expected_output ?? ''} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
