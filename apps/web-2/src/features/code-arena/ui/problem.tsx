import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
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
      <div className="flex flex-col gap-1">
        <h2 id="code-problem" className="text-xl font-semibold">
          {m.code_problem()}
        </h2>
        {difficulty || limits.length > 0 ? (
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground tabular-nums">
            {difficulty ? <span className="font-medium text-foreground">{difficultyLabels[difficulty]()}</span> : null}
            {limits.map(limit => (
              <span key={limit}>{limit}</span>
            ))}
          </p>
        ) : null}
      </div>
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
          <ol className="flex flex-col divide-y border-y">
            {samples.map((test, index) => (
              <li key={test.id} className="flex flex-col gap-2 py-3">
                <p className="text-sm font-medium">{test.description ?? m.code_sample({ number: index + 1 })}</p>
                <div className="grid min-w-0 gap-2 @xl:grid-cols-2 @xl:gap-4">
                  <Io label={m.code_io_input()} text={test.input ?? ''} />
                  <Io label={m.code_io_expected()} text={test.expected_output ?? ''} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
