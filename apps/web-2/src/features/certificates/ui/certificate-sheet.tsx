import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { UniversityMark } from '#/shared/components/university-mark'

import { paper } from './certificate-paper'

/**
 * The certificate as one sheet: white paper under a solid ink head, the same in every theme and mode. Its
 * weight comes from the solid head and the type; the facts come from the page.
 */

/** The sheet at full size: who issued it on the solid head, then what the page puts on it. */
export function CertificateSheet({ children }: { children: ReactNode }) {
  return (
    <article data-dye="sheet" className={paper}>
      <div data-dye="ink" className="ab-dye flex items-center justify-between gap-6 px-5 py-5 @xl:px-14 @xl:py-8">
        <UniversityMark ink="white" className="h-9 @xl:h-12" />
        <img
          src="/app_logo_light_full.svg"
          alt={m.platform_brand()}
          width={327}
          height={119}
          className="h-8 w-auto @xl:h-11"
        />
      </div>
      <div className="flex flex-1 flex-col gap-9 px-5 py-8 @xl:gap-12 @xl:px-14 @xl:py-14">{children}</div>
    </article>
  )
}
