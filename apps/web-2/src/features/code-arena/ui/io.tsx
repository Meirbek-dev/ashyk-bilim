/** A program's input or output, verbatim, wrapped inside its column (no page scroll at 390 px). */
export function Io({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <pre className="rounded-md bg-muted p-2 font-mono break-all whitespace-pre-wrap">{text}</pre>
    </div>
  )
}
