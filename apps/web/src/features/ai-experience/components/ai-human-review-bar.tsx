'use client'

import { CheckIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

type AIHumanReviewBarProps = {
  onApprove: () => void
  onReject?: () => void
  disabled?: boolean
}

export function AIHumanReviewBar({ onApprove, onReject, disabled }: AIHumanReviewBarProps) {
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t p-3 backdrop-blur">
      {onReject ? (
        <Button variant="outline" onClick={onReject} disabled={disabled}>
          <XIcon data-icon="inline-start" />
          Reject
        </Button>
      ) : null}
      <Button onClick={onApprove} disabled={disabled}>
        <CheckIcon data-icon="inline-start" />
        Approve
      </Button>
    </div>
  )
}
