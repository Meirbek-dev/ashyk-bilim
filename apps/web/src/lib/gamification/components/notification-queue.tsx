/**
 * XP Notification Queue System
 *
 * Manages multiple XP notifications with:
 * - Automatic batching of similar events
 * - Smart positioning to avoid content blocking
 * - Queue management to prevent spam
 * - Smooth transitions between notifications
 *
 * Performance optimization:
 * - Uses setTimeout for each notification instead of setInterval polling
 * - Prevents jittery animations caused by excessive re-renders (was 10x/sec)
 * - Properly cleans up timeouts on unmount and manual dismissal
 */

'use client'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { animations } from '../design-tokens'

// ============================================================================
// Types
// ============================================================================

export interface XPNotification {
  id: string
  amount: number
  source: string
  triggeredLevelUp?: boolean
  timestamp: number
}

export interface XPNotificationQueueOptions {
  maxVisible?: number
  batchWindowMs?: number
  displayDurationMs?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

export interface BatchedNotification extends XPNotification {
  batchCount: number
  totalAmount: number
}

// ============================================================================
// Notification Queue Hook
// ============================================================================

const DEFAULT_OPTIONS: Required<XPNotificationQueueOptions> = {
  maxVisible: 3,
  batchWindowMs: 2000,
  displayDurationMs: 3000,
  position: 'bottom-right',
}

export function useXPNotificationQueue(options: XPNotificationQueueOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const [queue, setQueue] = useState<BatchedNotification[]>([])
  const [visible, setVisible] = useState<BatchedNotification[]>([])
  const timeoutsRef = useRef(new Map())

  // Add notification to queue with batching logic
  function addNotification(notification: Omit<XPNotification, 'id' | 'timestamp'>) {
    const newNotification: XPNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    }

    setQueue(prev => {
      // Try to batch with recent similar notifications
      const recentSimilar = prev.find(
        n =>
          n.source === newNotification.source && Date.now() - n.timestamp < opts.batchWindowMs && !n.triggeredLevelUp,
      )

      if (recentSimilar) {
        // Clear existing timeout for this notification
        const existingTimeout = timeoutsRef.current.get(recentSimilar.id)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        // Batch with existing notification
        const updated = prev.map(n =>
          n.id === recentSimilar.id
            ? {
                ...n,
                batchCount: n.batchCount + 1,
                totalAmount: n.totalAmount + newNotification.amount,
                timestamp: Date.now(), // Reset timestamp for batched notification
              }
            : n,
        )

        // Set new timeout for batched notification
        const timeout = setTimeout(() => {
          setQueue(q => q.filter(n => n.id !== recentSimilar.id))
          setVisible(v => v.filter(n => n.id !== recentSimilar.id))
          timeoutsRef.current.delete(recentSimilar.id)
        }, opts.displayDurationMs)
        timeoutsRef.current.set(recentSimilar.id, timeout)

        return updated
      }

      // Add as new notification
      const batched: BatchedNotification = {
        ...newNotification,
        batchCount: 1,
        totalAmount: newNotification.amount,
      }

      // Schedule automatic dismissal
      const timeout = setTimeout(() => {
        setQueue(q => q.filter(n => n.id !== batched.id))
        setVisible(v => v.filter(n => n.id !== batched.id))
        timeoutsRef.current.delete(batched.id)
      }, opts.displayDurationMs)
      timeoutsRef.current.set(batched.id, timeout)

      return [...prev, batched]
    })
  }

  // Update visible list whenever queue changes
  const visibleRafRef = useRef<number | null>(null)
  useEffect(() => {
    // Schedule update on next animation frame to avoid synchronous update in render
    if (visibleRafRef.current) cancelAnimationFrame(visibleRafRef.current)
    visibleRafRef.current = requestAnimationFrame(() => {
      setVisible(queue.slice(0, opts.maxVisible))
    })
    return () => {
      if (visibleRafRef.current) cancelAnimationFrame(visibleRafRef.current)
    }
  }, [queue, opts.maxVisible])

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
      timeouts.clear()
    }
  }, [])

  // Manually dismiss a notification
  function dismissNotification(id: string) {
    // Clear timeout if exists
    const timeout = timeoutsRef.current.get(id)
    if (timeout) {
      clearTimeout(timeout)
      timeoutsRef.current.delete(id)
    }
    setQueue(prev => prev.filter(n => n.id !== id))
    setVisible(prev => prev.filter(n => n.id !== id))
  }

  // Clear all notifications
  function clearAll() {
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout))
    timeoutsRef.current.clear()
    setQueue([])
    setVisible([])
  }

  return {
    notifications: visible,
    addNotification,
    dismissNotification,
    clearAll,
    queueSize: queue.length,
  }
}

// ============================================================================
// Notification Container Component
// ============================================================================

interface XPNotificationContainerProps {
  notifications: BatchedNotification[]
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  onDismiss: (id: string) => void
  renderNotification: (notification: BatchedNotification) => React.ReactNode
}

export function XPNotificationContainer({
  notifications,
  position = 'bottom-right',
  onDismiss: _onDismiss,
  renderNotification,
}: XPNotificationContainerProps) {
  const prefersReducedMotion = useReducedMotion()

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }

  // Simplified variants for reduced motion preference
  const containerVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      }

  const itemVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : {
        hidden: {
          opacity: 0,
          y: position.startsWith('bottom') ? 50 : -50,
          scale: 0.8,
        },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            type: 'spring' as const,
            stiffness: 500,
            damping: 30,
          },
        },
        exit: {
          opacity: 0,
          x: position.endsWith('right') ? 100 : -100,
          scale: 0.8,
          transition: {
            duration: animations.duration.fast / 1000,
          },
        },
      }

  return (
    <motion.div
      className={`pointer-events-none fixed z-50 flex max-w-md flex-col gap-2 ${positionClasses[position]}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map(notification => (
          <motion.div
            key={notification.id}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout={!prefersReducedMotion}
            className="pointer-events-auto"
          >
            {renderNotification(notification)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================================================
// Smart Positioning Hook
// ============================================================================

export interface ContextualPosition {
  x: number
  y: number
  avoid?: 'top' | 'bottom' | 'left' | 'right'
}
