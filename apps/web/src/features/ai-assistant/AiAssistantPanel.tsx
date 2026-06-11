'use client'

import { useTranslations } from 'next-intl'

import { StudentTutorWorkspace } from '@/features/ai'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'

interface AiAssistantPanelProps {
  open: boolean
  onClose: () => void
  runtime: StudentActivityRuntime
}

export default function AiAssistantPanel({ open, onClose, runtime }: AiAssistantPanelProps) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const activityTitle = runtime.activity?.title ?? runtime.course.title

  return (
    <StudentTutorWorkspace
      title={t('title')}
      description={activityTitle}
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) onClose()
      }}
    />
  )
}
