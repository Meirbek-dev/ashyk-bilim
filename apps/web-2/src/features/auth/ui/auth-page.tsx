import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'
import { FocusPage } from '#/shared/ui/templates/focus-page'

/** The focus layout of the guest pages (sign in, sign up, verify): back to the landing, one narrow column. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  const back = (
    <Link to="/" variant="ghost">
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </Link>
  )
  return (
    <FocusPage back={back} title={title}>
      <section className="mx-auto flex max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </section>
    </FocusPage>
  )
}
