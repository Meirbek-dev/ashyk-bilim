'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import NewActivityModal from '@components/Objects/Modals/Activities/Create/NewActivity'
import { useActivityMutations } from '@/hooks/mutations/useActivityMutations'
import { useCourse } from '@components/Contexts/CourseContext'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { courseKeys } from '@/hooks/courses/courseKeys'
import type { ActivityCreateValues } from '@/schemas/activitySchemas'

interface NewActivityButtonProps {
  chapterId: number
}

const NewActivityButton = (props: NewActivityButtonProps) => {
  const [newActivityModal, setNewActivityModal] = useState(false)
  const course = useCourse()
  const queryClient = useQueryClient()
  const activityMutations = useActivityMutations(course.courseStructure.course_uuid, true)
  const t = useTranslations('CourseEdit.NewActivityModal')
  const tNotify = useTranslations('DashPage.Notifications')

  const closeNewActivityModal = async () => {
    setNewActivityModal(false)
  }

  const submitActivity = async (activity: AppPayload) => {
    const toast_loading = toast.loading(tNotify('creatingActivity'))
    try {
      await activityMutations.createActivity(activity as ActivityCreateValues, props.chapterId)
      toast.success(tNotify('activityCreatedSuccess'))
      setNewActivityModal(false)
    } catch (error: unknown) {
      const err = error as Error | AppApiError
      toast.error((err && 'message' in err ? err.message : '') || tNotify('uploadFailed'))
      throw error
    } finally {
      toast.dismiss(toast_loading)
    }
  }

  const submitFileActivity = async ({ file, type, activity, chapterId }: AppFileActivityInput) => {
    const toast_loading = toast.loading(tNotify('uploadingAndCreating'))
    const courseUuid = course.courseStructure.course_uuid
    const activityPayload = courseUuid ? { ...activity, course_uuid: activity?.course_uuid ?? courseUuid } : activity

    try {
      await activityMutations.createFileActivity(
        file,
        type,
        activityPayload as Partial<ActivityCreateValues>,
        chapterId,
        progress => {
          toast.loading(`${tNotify('uploadingAndCreating')} ${progress.percentage}%`, {
            id: toast_loading,
          })
        },
      )

      setNewActivityModal(false)
      toast.dismiss(toast_loading)
      toast.success(tNotify('fileUploadSuccess'))
      toast.success(tNotify('activityCreatedSuccess'))
    } catch (error: unknown) {
      toast.dismiss(toast_loading)
      const err = error as Error | AppApiError
      toast.error((err && 'message' in err ? err.message : '') || tNotify('uploadFailed'))
    }
  }

  const submitExternalVideo = async (external_video_data: AppPayload, activity: AppPayload, chapterId: number) => {
    const toast_loading = toast.loading(tNotify('creatingActivity'))
    try {
      await activityMutations.createExternalVideo(
        external_video_data,
        activity as Partial<ActivityCreateValues>,
        chapterId,
      )
      setNewActivityModal(false)
      toast.success(tNotify('activityCreatedSuccess'))
    } catch (error: unknown) {
      const err = error as Error | AppApiError
      toast.error((err && 'message' in err ? err.message : '') || tNotify('uploadFailed'))
    } finally {
      toast.dismiss(toast_loading)
    }
  }

  const createAndOpenActivity = async (kind: 'dynamic' | 'codechallenge') => {
    if (kind === 'codechallenge') {
      const toast_loading = toast.loading(tNotify('creatingActivity'))
      try {
        const courseId = course.courseStructure.id
        const response = await apiFetch('assessments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'CODE_CHALLENGE',
            title: t('quickCreate.codeChallengeName'),
            description: '',
            course_id: courseId,
            chapter_id: props.chapterId,
            grading_type: 'PERCENTAGE',
            policy: {
              settings_json: {
                difficulty: 'MEDIUM',
                grading_strategy: 'PARTIAL_CREDIT',
                execution_mode: 'COMPLETE_FEEDBACK',
                allow_custom_input: true,
              },
            },
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.detail?.message || payload.detail || tNotify('uploadFailed'))
        }

        // Invalidate course structure queries so the new activity appears on the page
        await queryClient.invalidateQueries({
          queryKey: courseKeys.structure(course.courseStructure.course_uuid, true),
        })

        toast.success(tNotify('activityCreatedSuccess'))
        setNewActivityModal(false)
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : tNotify('uploadFailed'))
        throw error
      } finally {
        toast.dismiss(toast_loading)
      }
      return
    }

    const activityPayload = {
      name: t('quickCreate.dynamicPageName'),
      chapter_id: props.chapterId,
      activity_type: 'TYPE_DYNAMIC',
      activity_sub_type: 'SUBTYPE_DYNAMIC_PAGE',
    }

    await submitActivity(activityPayload)
  }

  return (
    <div className="flex justify-center">
      <Dialog open={newActivityModal} onOpenChange={setNewActivityModal}>
        <DialogTrigger render={<Button className="h-10" />}>
          <Plus className="h-3.5 w-3.5" />
          {t('title')}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-full min-w-fit overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{t('title')}</DialogTitle>
            <DialogDescription className="text-sm">{t('description')}</DialogDescription>
          </DialogHeader>
          <NewActivityModal
            closeModal={closeNewActivityModal}
            submitFileActivity={submitFileActivity}
            submitExternalVideo={submitExternalVideo}
            submitActivity={submitActivity}
            createAndOpenActivity={createAndOpenActivity}
            chapterId={props.chapterId}
            course={{
              courseStructure: course.courseStructure,
              withUnpublishedActivities: course.withUnpublishedActivities,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NewActivityButton
