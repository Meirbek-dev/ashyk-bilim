'use client'

/**
 * InlineQuizAuthor — Teacher authoring view for inline quizzes.
 *
 * On first render (no assessmentUuid), creates a new inline quiz assessment
 * via POST /assessments/inline-quiz. Then opens the standard item editor.
 */

import { useCallback, useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface InlineQuizAuthorProps {
  assessmentUuid: string | null
  onAssessmentCreated: (uuid: string) => void
}

export default function InlineQuizAuthor({
  assessmentUuid,
  onAssessmentCreated,
}: InlineQuizAuthorProps) {
  const t = useTranslations('DashPage.Editor.InlineQuizExtension')
  const [isCreating, setIsCreating] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const handleCreate = useCallback(async () => {
    if (assessmentUuid) {
      setIsEditorOpen(true)
      return
    }

    setIsCreating(true)
    try {
      // TODO: Wire to actual API call once the route is implemented
      // const response = await apiFetch('/assessments/inline-quiz', { method: 'POST', body: { activity_id: ... } });
      // onAssessmentCreated(response.assessment_uuid);
      // setIsEditorOpen(true);
    } catch (error) {
      console.error('Failed to create inline quiz:', error)
    } finally {
      setIsCreating(false)
    }
  }, [assessmentUuid])

  if (assessmentUuid && !isEditorOpen) {
    return (
      <div className="border-primary/20 bg-primary/5 flex items-center gap-2 rounded-lg border p-3">
        <BookOpen className="text-primary size-4" />
        <span className="flex-1 text-sm font-medium">{t('title')}</span>
        <Button size="sm" variant="ghost" onClick={() => setIsEditorOpen(true)}>
          {t('editQuestions')}
        </Button>
      </div>
    )
  }

  if (!assessmentUuid) {
    return (
      <div className="border-muted-foreground/30 flex items-center justify-center rounded-lg border border-dashed p-6">
        <Button size="sm" variant="outline" onClick={handleCreate} disabled={isCreating}>
          <Plus className="mr-1 size-4" />
          {t('title')}
        </Button>
      </div>
    )
  }

  // TODO: Render the standard NativeItemStudio in a modal/drawer
  return (
    <div className="border-primary/20 bg-primary/5 rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">
        {t('itemEditorComingSoon', { assessmentUuid })}
      </p>
      <Button size="sm" variant="ghost" onClick={() => setIsEditorOpen(false)}>
        {t('close')}
      </Button>
    </div>
  )
}
