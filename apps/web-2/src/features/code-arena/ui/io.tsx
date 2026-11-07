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
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="py-1.5 text-muted-foreground">{m.code_io_empty()}</p>
      </div>
    )
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {label}
        {mark === null ? null : (
          <span className="text-destructive">{m.code_diff_line({ line: formatNumber(mark + 1) })}</span>
        )}
      </span>
      <pre
        // A box that scrolls takes focus, so it scrolls from the keyboard too (axe scrollable-region-focusable).
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be reachable by keyboard
        tabIndex={0}
        aria-label={label}
        className="max-h-80 overflow-auto rounded-sm bg-muted px-2.5 py-1.5 font-mono leading-relaxed whitespace-pre"
      >
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
