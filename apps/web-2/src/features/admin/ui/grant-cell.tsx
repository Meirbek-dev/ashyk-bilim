import { grantIsBroad, type GrantWords } from '../model/permissions'

/**
 * One grant in a cell. In the matrix a scope sits under its action's column, so the action is for screen readers; in the
 * last column, and on a phone, it stays in words (on a phone actions and scopes form two columns of their own).
 */
export function GrantCell({ words, named }: { words: GrantWords; named: boolean }) {
  const { grant, action, scope } = words
  return (
    <li title={grant} className="grid grid-cols-2 gap-x-3 wrap-anywhere @4xl:block">
      {action === null || scope === null ? (
        <span className="font-mono text-muted-foreground">{grant}</span>
      ) : (
        <>
          <span className={named ? undefined : '@4xl:sr-only'}>{action}</span>
          <span className={named ? 'sr-only text-muted-foreground @4xl:not-sr-only' : 'sr-only'}> · </span>
          <span className={grantIsBroad(grant) ? undefined : 'text-muted-foreground'}>{scope}</span>
        </>
      )}
    </li>
  )
}
