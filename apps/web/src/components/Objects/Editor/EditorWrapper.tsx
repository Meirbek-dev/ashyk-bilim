'use client'

import { useActivityAutosave } from '@/hooks/useActivityAutosave'

import { PlatformContextProvider } from '@/components/Contexts/PlatformContext'
import { stripEmptyFileBlocks } from '@components/Objects/Editor/core'
import type { ActivityRef } from '@components/Objects/Editor/core'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/hooks/useApiError'
import type { JSX } from 'react'
import { toast } from 'sonner'

import { AuthoringEditor } from './views'

import type { Platform } from '@/types/platform'
import { ActivityAIDockLayout, ActivityAITrigger } from '@/features/ai-experience'
import type { AIScope } from '@/features/ai-experience'
import { CourseAIHub } from '@/features/course-qa'

interface EditorWrapperProps {
  content: unknown
  activity: ActivityRef & { version?: number }
  course: {
    course_uuid: string
    name: string
    thumbnail_image?: string | null
  }
  platform?: Platform | null
}

function EditorWrapper(props: EditorWrapperProps): JSX.Element {
  const t = useTranslations('DashPage.Editor.EditorWrapper')
  const { handleApiError } = useApiError()
  const activityAutosave = useActivityAutosave({
    activityUuid: props.activity.activity_uuid,
    courseUuid: props.course.course_uuid,
    loadedContent: props.content,
  })

  // BUG-376: content and the lock only - the loaded name/published flag are
  // stale once the curriculum edits them, and a rebased save must not undo that.
  const contentPayload = (content: unknown) => ({
    content: stripEmptyFileBlocks(structuredClone(content)),
    version: props.activity.version,
  })

  async function setContent(content: unknown) {
    // Nothing may overwrite the other tab's save - but a click on «Сохранить» says why nothing happened.
    if (activityAutosave.saveStatus === 'conflict') {
      toast.error(t('conflictSaveBlocked'))
      return
    }
    if (activityAutosave.saveStatus === 'forbidden') {
      toast.error(t('noAccess'))
      return
    }
    toast.promise(activityAutosave.flush(contentPayload(content)), {
      loading: t('saving'),
      success: () => <b>{t('saveSuccess')}</b>,
      error: err => {
        if (err?.status === 403) return <b>{t('noAccess')}</b>
        if (err?.status === 413) return <b>{t('tooLarge')}</b>
        return <b>{handleApiError(err, undefined, t('saveError')).message}</b>
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
            activityAutosave.onChange(contentPayload(content))
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
