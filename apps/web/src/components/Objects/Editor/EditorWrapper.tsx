'use client'

import { useActivityAutosave } from '@/hooks/useActivityAutosave'

import { PlatformContextProvider } from '@/components/Contexts/PlatformContext'
import type { ActivityRef } from '@components/Objects/Editor/core'
import { useTranslations } from 'next-intl'
import type { JSX } from 'react'
import { toast } from 'sonner'

import { AuthoringEditor } from './views'

import type { Platform } from '@/types/platform'
import { ActivityAIDockLayout, ActivityAITrigger } from '@/features/ai-experience'
import type { AIScope } from '@/features/ai-experience'
import { CourseAIHub } from '@/features/course-qa'

interface EditorWrapperProps {
  content: unknown
  activity: ActivityRef
  course: {
    course_uuid: string
    name: string
    thumbnail_image?: string | null
  }
  platform?: Platform | null
}

const EditorWrapper = (props: EditorWrapperProps): JSX.Element => {
  const t = useTranslations('DashPage.Editor.EditorWrapper')
  const activityAutosave = useActivityAutosave({
    activityUuid: props.activity.activity_uuid,
    courseUuid: props.course.course_uuid,
  })

  async function setContent(content: unknown) {
    const { activity } = props

    const plainContent = structuredClone(content)
    const updatedActivity = { ...activity, content: plainContent }

    toast.promise(activityAutosave.flush(updatedActivity), {
      loading: t('saving'),
      success: () => <b>{t('saveSuccess')}</b>,
      error: err => {
        const errorMessage = err?.data?.detail || err?.data?.message || t('saveError')
        const status = err?.status
        return <b>{status ? t('detailedSaveError', { status, message: errorMessage }) : errorMessage}</b>
      },
    })
  }

  const aiScope: AIScope = {
    courseUuid: props.course.course_uuid,
    activityUuid: props.activity.activity_uuid,
    surface: 'teacher-studio',
  }

  return (
    <PlatformContextProvider initialPlatform={props.platform}>
      <ActivityAIDockLayout
        scope={aiScope}
        defaultMode="review"
        panel={<CourseAIHub courseUuid={props.course.course_uuid} variant="panel" />}
        className="min-w-0"
      >
        <AuthoringEditor
          platform={props.platform}
          course={props.course}
          activity={props.activity}
          content={props.content}
          onContentChange={content => {
            const plainContent = structuredClone(content)
            const updatedActivity = { ...props.activity, content: plainContent }
            activityAutosave.onChange(updatedActivity)
          }}
          saveState={activityAutosave.saveStatus}
          setContent={setContent}
          assistantSlot={<ActivityAITrigger scope={aiScope} />}
        />
      </ActivityAIDockLayout>
    </PlatformContextProvider>
  )
}

export default EditorWrapper
