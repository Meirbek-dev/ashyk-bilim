'use client'

import { XCircleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { AIWorkState } from '../lib/ai-run-state'

export function AIRunProgress({ onCancel, state }: { onCancel?: (() => void) | undefined; state: AIWorkState }) {
  const t = useTranslations('AiExperience.states.labels')
  if (state === 'idle' || state === 'confirming') return null

  const terminal = state === 'complete' || state === 'failed' || state === 'cancelled' || state === 'needs_human_review'

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {!terminal ? <Spinner data-icon="inline-start" /> : null}
          <span className="truncate">{t(state)}</span>
        </div>
        {!terminal && onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <XCircleIcon data-icon="inline-start" aria-hidden="true" />
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
