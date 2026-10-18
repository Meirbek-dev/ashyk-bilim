import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { BrandMark } from '#/shared/components/brand-mark'
import { CourseCover } from '#/shared/components/course-cover'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'

/**
 * The focus layout of the guest pages (sign in, sign up, verify): back to the landing, one narrow column, and from
 * lg the platform's ornament beside it.
 */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  const back = (
    <RouterLink to="/" className={buttonVariants({ variant: 'ghost' })}>
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
        <div aria-hidden className="hidden lg:block">
          <CourseCover seed="ashyq-bilim" tone={0} shape="panel" className="aspect-4/5 w-full rounded-2xl border" />
        </div>
      </div>
    </FocusPage>
  )
}
