import { m } from '#/paraglide/messages'

import { BackLink } from './back-link'

/** A drill-down id outside the caller's scope (404) or malformed (422): shown in the tab, the tabs stay. */
export function DrillNotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-xl font-semibold">{m.analytics_not_found_title()}</h2>
      <p className="text-muted-foreground">{m.analytics_not_found_text()}</p>
      <BackLink />
    </section>
  )
}
