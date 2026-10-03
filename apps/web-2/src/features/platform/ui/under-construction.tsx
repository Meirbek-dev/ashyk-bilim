import { useMatch, useMatches, useRouteContext, Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

/**
 * The one stub for a route whose slice is not built yet: the route's `staticData.title` and one sentence, in the
 * kit's empty-state look. A tab shows it under its layout; a focus route inside FocusPage. Gate: under-construction.
 */
export function UnderConstruction() {
  const self = useMatch({ strict: false })
  const parent = useMatches({ select: matches => matches[matches.findIndex(match => match.id === self.id) - 1] })
  const { session } = useRouteContext({ from: '__root__' })
  const title = self.staticData.title?.() ?? ''
  const text = <p className="text-muted-foreground">{m.platform_under_construction()}</p>
  if (parent?.staticData.tabs) {
    return (
      <section className="flex flex-col items-start gap-2 py-8">
        <h2 className="text-xl font-semibold">{title}</h2>
        {text}
      </section>
    )
  }
  const page = (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {text}
    </section>
  )
  if (self.staticData.layout !== 'focus') return page
  const back = (
    <RouterLink to={session ? '/home' : '/'} className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
  )
  return (
    <FocusPage back={back} title={title}>
      {page}
    </FocusPage>
  )
}
