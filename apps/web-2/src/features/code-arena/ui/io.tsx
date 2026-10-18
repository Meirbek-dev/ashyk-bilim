import { m } from '#/paraglide/messages'

/** A program's input or output, verbatim, wrapped inside its column (no page scroll at 390 px); a long one scrolls. */
export function Io({ label, text }: { label: string; text: string }) {
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
      <span className="text-muted-foreground">{label}</span>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 font-mono break-all whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  )
}
