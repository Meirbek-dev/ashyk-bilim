'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const STALE_OUTPUT_DAYS = 14
const STALE_OUTPUT_COPY = {
  description: `Re-run this result before using it for a learner-facing decision. The source changed or the output is older than ${STALE_OUTPUT_DAYS} days.`,
  title: 'AI output may be stale',
}

export function AIStaleOutputMarker({
  createdAt,
  sourceUpdatedAt,
}: {
  createdAt?: string | null | undefined
  sourceUpdatedAt?: string | null | undefined
}) {
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(() => setNowMs(Date.now()), 0)
    return () => globalThis.clearTimeout(timeoutId)
  }, [])

  if (!createdAt) return null

  const created = new Date(createdAt)
  const sourceUpdated = sourceUpdatedAt ? new Date(sourceUpdatedAt) : null
  if (Number.isNaN(created.valueOf())) return null

  const staleByAge = nowMs !== null && nowMs - created.getTime() > STALE_OUTPUT_DAYS * 24 * 60 * 60 * 1000
  const staleBySource =
    sourceUpdated !== null && !Number.isNaN(sourceUpdated.valueOf()) && sourceUpdated.getTime() > created.getTime()

  if (!staleByAge && !staleBySource) return null

  return (
    <Alert>
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{STALE_OUTPUT_COPY.title}</AlertTitle>
      <AlertDescription>{STALE_OUTPUT_COPY.description}</AlertDescription>
    </Alert>
  )
}
