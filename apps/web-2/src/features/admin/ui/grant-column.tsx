import type { GrantWords } from '../model/permissions'
import { GrantCell } from './grant-cell'

export function GrantColumn({ grants, named = false }: { grants: readonly GrantWords[]; named?: boolean }) {
  // An empty cell is a dash in the matrix, so a gap reads as "no right", not as a missing value; nothing on a phone.
  if (grants.length === 0)
    return (
      <span aria-hidden className="hidden text-muted-foreground @4xl:block">
        —
      </span>
    )
  return (
    <ul className="flex flex-col gap-0.5">
      {grants.map(words => (
        <GrantCell key={words.grant} words={words} named={named} />
      ))}
    </ul>
  )
}
