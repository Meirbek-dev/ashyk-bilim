import { m } from '#/paraglide/messages'
import type { Citation } from '#/shared/api/gen/types.gen'

/** The sources an answer cites: label and the quoted excerpt. Nothing when there are none. */
export function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{m.ai_citations()}</h4>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {citations.map(citation => (
          <li key={citation.citation_id} className="wrap-anywhere">
            <span className="text-foreground">{citation.label}</span>
            {citation.excerpt ? ` - ${citation.excerpt}` : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
