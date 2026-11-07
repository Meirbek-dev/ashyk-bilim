import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { BrandMark } from '#/shared/components/brand-mark'
import { buttonVariants } from '#/shared/components/button-variants'
import { SkipLink } from '#/shared/components/skip-link'
import { UniversityMark } from '#/shared/components/university-mark'

/**
 * The guest pages (sign in, sign up, verify): one narrow column on the paper, and from lg a solid navy field with the
 * university's mark and motto filling the other half of the window. The way back goes to the landing, or to the public
 * page the guest came from (`back`).
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
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <SkipLink />
      <div className="flex min-w-0 flex-col px-4 py-3 sm:px-8">
        <div>
          {/* `href` wins over `to` (a built path with its search); `to` only satisfies the route types. */}
          <RouterLink to="/" href={backHref} className={buttonVariants({ variant: 'ghost', className: '-ml-2.5' })}>
            <ArrowLeft aria-hidden />
            {m.platform_back()}
          </RouterLink>
        </div>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-10"
        >
          <div>
            <BrandMark full className="h-12 w-auto" />
            <span className="sr-only">{m.platform_brand()}</span>
          </div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {children}
        </main>
      </div>
      <div
        data-dye="ink"
        className="ab-dye sticky top-0 hidden h-dvh w-full flex-col justify-between border-l p-12 lg:flex"
      >
        <UniversityMark ink="white" className="h-12 self-start" />
        <div className="flex max-w-lg flex-col gap-4">
          <p className="font-heading text-display font-semibold">{m.platform_brand_motto()}</p>
          <p className="text-lg opacity-80">{m.platform_brand_tagline()}</p>
        </div>
      </div>
    </div>
  )
}
