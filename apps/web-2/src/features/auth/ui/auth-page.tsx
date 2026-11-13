import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { BrandMark } from '#/shared/components/brand-mark'
import { buttonVariants } from '#/shared/components/button-variants'
import { SkipLink } from '#/shared/components/skip-link'
import { UniversityMark } from '#/shared/components/university-mark'

/**
 * The guest pages (sign in, sign up, verify): one narrow column on the paper, and from lg a solid ink field with the
 * university's mark and motto filling the other half of the window. The way back goes to the landing, or to the public
 * page the guest came from (`back`). The page's title is its largest type: the motto on the field is set a step
 * quieter than it reads on the landing, so the form, not the panel, is what the eye lands on.
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
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-10"
        >
          <div className="flex flex-col gap-6">
            <div>
              <BrandMark full className="h-11 w-auto" />
              <span className="sr-only">{m.platform_brand()}</span>
            </div>
            <h1 className="text-3xl font-semibold text-balance">{title}</h1>
          </div>
          {/* One step between the parts of the form (notes, Google, the fields, the way to the other form). */}
          <div className="flex flex-col gap-6">{children}</div>
        </main>
      </div>
      <div
        data-dye="ink"
        className="ab-dye sticky top-0 hidden h-dvh w-full flex-col justify-between border-l p-12 lg:flex"
      >
        <UniversityMark ink="white" className="h-11 self-start" />
        <div className="flex max-w-md flex-col gap-3">
          <p className="font-heading text-3xl font-semibold text-balance">{m.platform_brand_motto()}</p>
          <p className="text-base text-pretty opacity-70">{m.platform_brand_tagline()}</p>
        </div>
      </div>
    </div>
  )
}
