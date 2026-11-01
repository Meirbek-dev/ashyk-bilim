import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'

type IoProps = {
  label: string
  text: string
  /** A line to mark (0-based): where the output first departs from the expected one (B-COD-31). */
  mark?: number | null
}

/**
 * A program's input or output, verbatim: lines are not wrapped (a traceback's caret stays under its column, «parsing»
 * is not split as if it held a space); a wide or long one scrolls inside its box, never the page at 390 px.
 */
export function Io({ label, text, mark = null }: IoProps) {
  // An empty input (a program that reads nothing) says so, rather than drawing an empty grey bar.
  if (text === '')
    return (
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <p className="rounded-md border border-dashed p-2 text-muted-foreground">{m.code_io_empty()}</p>
      </div>
    )
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="flex flex-wrap gap-x-3 text-muted-foreground">
        {label}
        {mark === null ? null : (
          <span className="text-destructive">{m.code_diff_line({ line: formatNumber(mark + 1) })}</span>
        )}
      </span>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 font-mono whitespace-pre">
        {mark === null
          ? text
          : text.split('\n').map((line, index) => (
              // Lines of one output never reorder: the index is their identity.
              <span key={index} className={index === mark ? 'block bg-destructive/15' : 'block'}>
                {line || ' '}
              </span>
            ))}
      </pre>
    </div>
  )
}
