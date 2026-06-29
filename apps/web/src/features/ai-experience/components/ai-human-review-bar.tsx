'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface AIHumanReviewBarProps {
  onApprove: () => void
  onReject?: () => void
  disabled?: boolean
}

export function AIHumanReviewBar({ onApprove, onReject, disabled }: AIHumanReviewBarProps) {
  const t = useTranslations('AiExperience.humanReviewBar')
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t p-3 backdrop-blur">
      {onReject ? (
        <Button variant="outline" onClick={onReject} disabled={disabled}>
          <XIcon data-icon="inline-start" />
          {t('reject')}
        </Button>
      ) : null}
      <Button onClick={onApprove} disabled={disabled}>
        <CheckIcon data-icon="inline-start" />
        {t('approve')}
      </Button>
    </div>
  )
}
