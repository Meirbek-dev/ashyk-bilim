import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

/** The focus layout of the guest pages (sign in, sign up, verify): back to the landing, one narrow column. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  const back = (
    <RouterLink to="/" className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
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
