import type { ReactNode } from 'react'

type ProgressRingProps = {
  /** 0..100 */
  value: number
  /** What sits in the middle (a level, a percent); sized by the caller. */
  children?: ReactNode
  className?: string
}

/** A round progress meter for compact places (a level, a course); decorative: the number is always in text too. */
export function ProgressRing({ value, children, className = 'size-12' }: ProgressRingProps) {
  const done = Math.min(100, Math.max(0, value))
  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${className}`}>
      <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90">
        <circle cx="18" cy="18" r="15.5" className="fill-none stroke-muted" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          pathLength={100}
          strokeDasharray={`${done} 100`}
          strokeLinecap="round"
          strokeWidth="4"
          className={`fill-none stroke-highlight ${done === 0 ? 'opacity-0' : ''}`}
        />
      </svg>
      {children}
    </span>
  )
}
