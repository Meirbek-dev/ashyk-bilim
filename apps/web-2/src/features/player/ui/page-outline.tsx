import type { OutlineEntry } from '#/features/editor'
import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'

const indent: Record<number, string> = { 0: '', 1: 'ps-6', 2: 'ps-12' }

/**
 * "On this page": the lesson's headings (B-PLY-17) as a book's table of contents between two hairlines: top-level ones
 * numbered in the margin, deeper levels set in under them.
 */
export function PageOutline({ outline }: { outline: readonly (OutlineEntry & { depth: number })[] }) {
  return (
    <nav aria-label={m.player_outline()} className="flex flex-col gap-2 border-y py-4">
      <h2 className="text-sm font-normal text-muted-foreground">{m.player_outline()}</h2>
      <ol className="flex flex-col gap-1 text-sm">
        {outline.map((entry, at) => {
          // The top-level headings up to and including this one: the number in the margin.
          const chapter = outline.slice(0, at + 1).filter(heading => heading.depth === 0).length
          return (
            <li key={entry.id} className={`flex items-baseline gap-2 ${indent[entry.depth] ?? 'ps-16'}`}>
              {entry.depth === 0 ? (
                <span aria-hidden className="w-4 shrink-0 font-heading text-muted-foreground tabular-nums">
                  {chapter}
                </span>
              ) : null}
              <span className="min-w-0 wrap-anywhere">
                <Anchor href={`#${entry.id}`} variant="title">
                  {entry.text}
                </Anchor>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
