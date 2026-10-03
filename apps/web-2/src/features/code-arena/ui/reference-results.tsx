import { m } from '#/paraglide/messages'
import type { LanguageInfo, ReferenceCheckResponse } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { languageOf } from '../model/arena'
import { Io } from './io'
import { referenceStatus } from './labels'

type ReferenceResultsProps = { results: ReferenceCheckResponse['results']; languages: LanguageInfo[] | null }

/** The reference check (B-COD-19): per language, its verdict, how many test cases passed and the compiler output. */
export function ReferenceResults({ results, languages }: ReferenceResultsProps) {
  return (
    <section aria-labelledby="code-check" className="flex min-w-0 flex-col gap-2">
      <h3 id="code-check" className="text-lg font-semibold">
        {m.code_check_title()}
      </h3>
      <ul className="flex flex-col divide-y text-sm">
        {results.map(result => {
          const status = result.ok
            ? { label: m.code_check_ok, tone: 'success' as const }
            : referenceStatus(result.status)
          return (
            <li key={result.language_id} className="flex min-w-0 flex-col gap-2 py-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">
                  {languageOf(languages, result.language_id)?.name ??
                    m.code_language_unknown({ id: result.language_id })}
                </span>
                <StatusBadge tone={status.tone}>{status.label()}</StatusBadge>
                {result.total > 0 ? (
                  <span className="tabular-nums">
                    {m.code_run_passed({ passed: result.passed, total: result.total })}
                  </span>
                ) : null}
              </div>
              {result.compile_output ? <Io label={m.code_compile_output()} text={result.compile_output} /> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
