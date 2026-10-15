import type { OutlineEntry } from '#/features/editor'
import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'

const indent: Record<number, string> = { 0: '', 1: 'ps-4', 2: 'ps-8' }

/** "On this page": the lesson's headings as anchor links (B-PLY-17), deeper levels indented. */
export function PageOutline({ outline }: { outline: readonly (OutlineEntry & { depth: number })[] }) {
  return (
    <nav aria-label={m.player_outline()} className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">{m.player_outline()}</h2>
      <ol className="flex flex-col gap-1 text-sm">
        {outline.map(entry => (
          <li key={entry.id} className={indent[entry.depth] ?? 'ps-12'}>
            <Anchor href={`#${entry.id}`}>{entry.text}</Anchor>
          </li>
        ))}
      </ol>
    </nav>
  )
}
