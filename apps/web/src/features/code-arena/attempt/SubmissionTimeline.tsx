'use client'

import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fromUnix } from '@/lib/api/contract'
import type { CodeSubmission } from '../domain'

interface SubmissionTimelineProps {
  submissions: CodeSubmission[]
  onRestoreSubmission?: (submission: CodeSubmission) => void
}

export function SubmissionTimeline({ submissions, onRestoreSubmission }: SubmissionTimelineProps) {
  const t = useTranslations('Activities.CodeChallenges')

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-4">
        {!submissions.length ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
            {t('noSubmissionsYet')}
          </div>
        ) : (
          submissions.map(submission => (
            <div key={submission.id} className="bg-card rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {t('attemptNumber', { number: submission.attempt_number })}
                    </span>
                    <Badge variant={submission.score === submission.max_score ? 'success' : 'secondary'}>
                      {submission.score === null
                        ? t(`attemptStatus.${submission.status}`)
                        : `${Math.round(submission.score)}/${submission.max_score}`}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {submission.submitted_at_unix === null
                      ? t('unknownTime')
                      : fromUnix(submission.submitted_at_unix).toLocaleString()}
                    {submission.language_id ? ` - ${t('languageIdFallback', { id: submission.language_id })}` : ''}
                  </div>
                </div>
                {onRestoreSubmission ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRestoreSubmission(submission)}>
                    <RotateCcw className="size-4" />
                    {t('restoreCode')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  )
}
