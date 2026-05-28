'use client'

import { useRef } from 'react'

import { cn } from '@/lib/utils'

interface TimerRingProps {
  remainingSeconds: number
  className?: string
}

const RADIUS = 16
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * SVG countdown ring that drains clockwise.
 *
 * Colour escalation:
 *  - Normal  (> 5 min remaining): primary / muted
 *  - Warning (≤ 5 min, > 1 min): amber
 *  - Urgent  (≤ 1 min):           red / destructive
 */
export function TimerRing({ remainingSeconds, className }: TimerRingProps) {
  // Capture total seconds on first render so the ring knows the full arc.
  const totalRef = useRef<number>(remainingSeconds)

  const fraction = totalRef.current > 0 ? Math.max(0, remainingSeconds / totalRef.current) : 0
  const dashOffset = CIRCUMFERENCE * (1 - fraction)

  const isUrgent = remainingSeconds <= 60
  const isWarning = remainingSeconds <= 300

  const ringColor = isUrgent ? 'stroke-destructive' : isWarning ? 'stroke-amber-500' : 'stroke-primary'

  const textColor = isUrgent ? 'text-destructive' : isWarning ? 'text-amber-600' : 'text-foreground'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative size-10 shrink-0">
        <svg viewBox="0 0 40 40" className="-rotate-90" aria-hidden="true">
          {/* Track */}
          <circle cx="20" cy="20" r={RADIUS} fill="none" strokeWidth="3" className="stroke-muted" />
          {/* Progress arc */}
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={cn('transition-[stroke-dashoffset] duration-1000 ease-linear', ringColor)}
          />
        </svg>
        {/* Centred label */}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums',
            textColor,
          )}
        >
          {formatDuration(remainingSeconds)}
        </span>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h${String(m % 60).padStart(2, '0')}m`
  }
  return `${m}:${String(rem).padStart(2, '0')}`
}
