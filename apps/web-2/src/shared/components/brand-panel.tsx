import { cn } from 'cn'

import { m } from '#/paraglide/messages'

import { EMBLEM } from './brand-emblem'
import { UniversityMark } from './university-mark'

/**
 * The platform's brand panel (landing hero, sign-in): the university's navy field with the Ashyq Bilim emblem engraved
 * across it, the university's mark on top and the motto below. The box (`className`) sets its size and shape.
 */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <div className={cn('ab-brand-panel relative isolate overflow-hidden rounded-2xl shadow-xs', className)}>
      <svg
        aria-hidden
        viewBox="0 0 100 125"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 -z-10 size-full"
      >
        <path
          d={EMBLEM.path}
          transform="translate(20 -14) scale(1.02)"
          className="ab-brand-panel-emblem"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex size-full flex-col justify-between gap-8 p-8 sm:p-10">
        <UniversityMark ink="white" className="h-10 sm:h-12" />
        <div className="flex max-w-xs flex-col gap-3">
          <span aria-hidden className="ab-brand-panel-rule h-1 w-10 rounded-full" />
          <p className="font-heading text-2xl font-semibold">{m.platform_brand_motto()}</p>
          <p className="ab-brand-panel-muted">{m.platform_brand_tagline()}</p>
        </div>
      </div>
    </div>
  )
}
