import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { BrandMark } from '#/shared/components/brand-mark'
import { BrandPanel } from '#/shared/components/brand-panel'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'

/**
 * The focus layout of the guest pages (sign in, sign up, verify): back to the landing (or to the public page the guest
 * came from, `back`), one narrow column, and from lg the brand panel beside it.
 */
export function AuthPage({
  title,
  back: backHref = '/',
  children,
}: {
  title: string
  back?: string
  children: ReactNode
}) {
  const back = (
    // `href` wins over `to` (a built path with its search); `to` only satisfies the route types.
    <RouterLink to="/" href={backHref} className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
  )
  return (
    // The heading below names the page: the top bar holds only the way back (no second «Вход» above the first).
    <FocusPage back={back} title="" wide>
      <div className="mx-auto grid w-full max-w-5xl items-center gap-16 lg:grid-cols-2 lg:py-8">
        <section className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <div>
            <BrandMark full className="h-14 w-auto" />
            <span className="sr-only">{m.platform_brand()}</span>
          </div>
          <h1 className="text-display font-semibold">{title}</h1>
          {children}
        </section>
        <BrandPanel className="hidden aspect-4/5 w-full lg:block" />
      </div>
    </FocusPage>
  )
}
