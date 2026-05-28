'use client'

/**
 * InlineQuizAttempt — Student attempt view for inline quizzes.
 *
 * Renders the quiz inline in lesson content using the canonical assessment
 * hooks and item renderers. Submits via POST /assessments/{uuid}/submit.
 */

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface InlineQuizAttemptProps {
  assessmentUuid: string
}

export default function InlineQuizAttempt({ assessmentUuid }: InlineQuizAttemptProps) {
  const t = useTranslations('DashPage.Editor.InlineQuizExtension')
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // TODO: Wire to useAssessment + useAssessmentSubmission hooks
  // This is the scaffold — full implementation uses the canonical item renderers

  if (submitted && score !== null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
        <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium">{t('score', { score })}</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground mb-3 text-sm">
        {t('quizInfo', { id: assessmentUuid.slice(0, 16) })}
      </p>
      {/* TODO: Render actual quiz items from useAssessment(assessmentUuid) */}
      <Button
        size="sm"
        disabled={isSubmitting}
        onClick={async () => {
          setIsSubmitting(true)
          try {
            // TODO: Call POST /assessments/{assessmentUuid}/submit.
            // setScore(result.final_score ?? result.auto_score ?? 0);
            setSubmitted(true)
          } finally {
            setIsSubmitting(false)
          }
        }}
      >
        {isSubmitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
        {t('submit')}
      </Button>
    </div>
  )
}
