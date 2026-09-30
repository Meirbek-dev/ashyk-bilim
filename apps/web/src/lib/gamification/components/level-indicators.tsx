/**
 * Level Progress Components
 *
 * Redesigned for minimalism:
 * - Clean, compact level display
 * - Subtle animations
 * - Focus on current level number
 */

'use client'

import { useTranslations } from 'next-intl'

import type { UserGamificationProfile } from '@/types/gamification'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motion, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { getLevelInfo } from '../levels'
import { cn } from '@/lib/utils'

const DEFAULT_PARTICLE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899']

// ============================================================================
// Compact Level Progress
// ============================================================================

interface LevelProgressProps {
  profile: UserGamificationProfile
  showMilestones?: boolean
  animated?: boolean
  className?: string
}

export function LevelProgress({
  profile,
  showMilestones: _showMilestones = false,
  animated = true,
  className,
}: LevelProgressProps) {
  const tXp = useTranslations('DashPage.UserAccountSettings.Gamification')
  const previousLevelRef = useRef(profile.level)
  const controls = useAnimationControls()
  const prefersReducedMotion = useReducedMotion()

  // `xp_to_next_level` is the XP still missing (the hero section reads it the
  // same way), so the level spans current + remaining.
  const currentLevelXP = profile.xp_in_current_level || 0
  const remainingXP = Math.max(0, profile.xp_to_next_level || 0)
  const levelSpan = currentLevelXP + remainingXP
  const progress = levelSpan > 0 ? (currentLevelXP / levelSpan) * 100 : 0

  // Effective animated state (respects user preference)
  const shouldAnimate = animated && !prefersReducedMotion

  // Detect level up (skip animation if reduced motion preferred)
  useEffect(() => {
    if (prefersReducedMotion) return
    if (profile.level > previousLevelRef.current && animated) {
      controls.start({
        scale: [1, 1.02, 1],
        transition: { duration: 0.4, times: [0, 0.5, 1] },
      })
    }
    previousLevelRef.current = profile.level
  }, [profile.level, controls, animated, prefersReducedMotion])

  return (
    <motion.div animate={controls} className={cn('space-y-1.5', className)}>
      {/* Compact progress bar */}
      <div className="bg-muted/50 relative h-1.5 overflow-hidden rounded-full">
        <motion.div
          className="from-primary/80 to-primary h-full rounded-full bg-linear-to-r"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{
            duration: shouldAnimate ? 0.6 : 0,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      </div>

      {/* UX-109: «180 ОП · 120 до уровня 4», not two bare numbers that read as «180 of 120». */}
      <div className="text-muted-foreground/80 text-center text-[10px] tabular-nums">
        {tXp('levelIndicators.compactProgress', {
          xp: currentLevelXP.toLocaleString(),
          remaining: remainingXP.toLocaleString(),
          level: profile.level + 1,
        })}
      </div>
    </motion.div>
  )
}

// ============================================================================
// Subtle Particle Effect
// ============================================================================

interface Particle {
  id: number
  x: number
  y: number
  size: number
  color: string
  duration: number
}

interface ParticleEffectProps {
  trigger: boolean
  particleCount?: number
  colors?: string[]
  duration?: number
  onComplete?: () => void
}

export function ParticleEffect({
  trigger,
  particleCount = 12,
  colors = DEFAULT_PARTICLE_COLORS,
  duration = 1000,
  onComplete,
}: ParticleEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const onCompleteRef = useRef(onComplete)
  const isAnimatingRef = useRef(false)
  const startRafRef = useRef<number | null>(null)
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefersReducedMotion = useReducedMotion()

  // Keep ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    // Skip particle animations when reduced motion is preferred
    if (prefersReducedMotion) {
      if (trigger) {
        // Still call onComplete callback but skip animation next frame
        const rafId = requestAnimationFrame(() => onCompleteRef.current?.())
        return () => cancelAnimationFrame(rafId)
      }
      return
    }

    if (!trigger || isAnimatingRef.current) return

    isAnimatingRef.current = true

    const newParticles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const colorIndex = Math.floor(Math.random() * colors.length)
      return {
        id: i,
        x: Math.random() * 80 - 40,
        y: -Math.random() * 60 - 20,
        size: Math.random() * 4 + 2,
        color: colors[colorIndex] ?? '#3b82f6',
        duration: Math.random() * 300 + duration,
      }
    })

    // Schedule particles on next animation frame and clear later
    startRafRef.current = requestAnimationFrame(() => {
      setParticles(newParticles)
    })

    endTimeoutRef.current = globalThis.setTimeout(() => {
      setParticles([])
      isAnimatingRef.current = false
      onCompleteRef.current?.()
    }, duration + 400)

    return () => {
      if (startRafRef.current) cancelAnimationFrame(startRafRef.current)
      if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current)
    }
  }, [trigger, particleCount, colors, duration, prefersReducedMotion])

  if (particles.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
          }}
          initial={{
            x: 0,
            y: 0,
            opacity: 0.8,
            scale: 0,
          }}
          animate={{
            x: particle.x,
            y: particle.y,
            opacity: [0.8, 0.6, 0],
            scale: [0, 1, 0.3],
          }}
          transition={{
            duration: particle.duration / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// Compact Level Badge (Redesigned)
// ============================================================================

interface GlowingLevelBadgeProps {
  level: number
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  className?: string
}

export function GlowingLevelBadge({ level, size = 'md', animated = true, className }: GlowingLevelBadgeProps) {
  const levelInfo = getLevelInfo(level, (key: string) => key)
  const prefersReducedMotion = useReducedMotion()

  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  }

  // Disable hover animations when reduced motion is preferred
  const shouldAnimate = animated && !prefersReducedMotion

  return (
    <motion.div
      className={cn('relative inline-flex items-center justify-center', className)}
      transition={{ duration: 0.2 }}
      {...(shouldAnimate ? { whileHover: { scale: 1.08 } } : {})}
    >
      {/* Subtle background glow */}
      <div
        className={cn('absolute inset-0 rounded-full opacity-20 blur-sm', levelInfo.color.replace('text-', 'bg-'))}
      />

      {/* Clean badge */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full border border-border/50 bg-background/95 backdrop-blur-sm shadow-sm',
          sizeClasses[size],
        )}
      >
        <span className={cn('font-semibold tabular-nums', levelInfo.color)}>{level}</span>
      </div>
    </motion.div>
  )
}
