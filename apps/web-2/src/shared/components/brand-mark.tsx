import { cn } from 'cn'

/** Official artwork; CSS follows the page's explicit or system color mode before hydration. */
export function BrandMark({ full = false, className = 'h-8 w-auto' }: { full?: boolean; className?: string }) {
  const suffix = full ? '_full' : ''
  return (
    <span aria-hidden className={cn('brand-mark inline-flex shrink-0', className)}>
      <img
        src={`/app_logo${suffix}.svg`}
        alt=""
        width={full ? 327.34 : 139.01}
        height={119.28}
        className="brand-mark-day h-full w-auto"
      />
      <img
        src={`/app_logo_light${suffix}.svg`}
        alt=""
        width={full ? 327.34 : 139.01}
        height={119.28}
        className="brand-mark-night h-full w-auto"
      />
    </span>
  )
}
