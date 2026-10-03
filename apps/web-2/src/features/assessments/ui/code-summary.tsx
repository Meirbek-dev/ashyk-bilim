import { m } from '#/paraglide/messages'
import type { CodeBody } from '#/shared/api/gen/types.gen'

/**
 * A code question in the builder: what it holds, read-only. Its editor (tests, reference solutions, starter code) is
 * slice 5.3 and replaces this summary.
 */
export function CodeSummary({ body }: { body: CodeBody }) {
  const tests = body.tests ?? []
  const visible = tests.filter(test => test.is_visible === true).length
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
      <p>
        {m.assessments_code_summary({
          languages: body.languages?.length ?? 0,
          visible,
          hidden: tests.length - visible,
        })}
      </p>
      <p className="text-muted-foreground">{m.assessments_code_note()}</p>
    </div>
  )
}
