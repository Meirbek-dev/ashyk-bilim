'use client'

import { useFormatter, useNow } from 'next-intl'
import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * "7 minutes ago" is computed against `now`, which differs between the SSR
 * pass and the client — so the relative form only renders after mount; the
 * server (and the hydrating client) print the absolute date instead.
 */
export default function RelativeTime({ date }: { date: string }) {
  const format = useFormatter()
  const now = useNow()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
  const value = new Date(date)
  return <span>{mounted ? format.relativeTime(value, now) : format.dateTime(value, { dateStyle: 'medium' })}</span>
}
