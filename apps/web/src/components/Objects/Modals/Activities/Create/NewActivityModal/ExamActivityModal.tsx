'use client'

import { valibotResolver } from '@hookform/resolvers/valibot'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useCreateExamWithActivity } from '@/features/assessments/hooks/exam'
import { useTranslations } from 'next-intl'
import { cleanActivityUuid, cleanCourseUuid } from '@/lib/course-management'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import * as v from 'valibot'

import { Field, FieldDescription, FieldError, FieldLabel } from '@components/ui/field'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'

// v2 has no `assessments/exam/config`; the time limit range is a fixed 1–180 minutes.
const TIME_LIMIT_MIN = 1
const TIME_LIMIT_MAX = 180
const DEFAULT_TIME_LIMIT = 50

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    activity_name: v.pipe(v.string(), v.minLength(1, t('activityNameRequired'))),
    exam_description: v.pipe(v.string(), v.minLength(1, t('examDescriptionRequired'))),
    time_limit: v.optional(v.pipe(v.number(), v.minValue(TIME_LIMIT_MIN), v.maxValue(TIME_LIMIT_MAX))),
    has_time_limit: v.boolean(),
    shuffle_questions: v.boolean(),
    allow_result_review: v.boolean(),
  })

type FormValues = v.InferInput<ReturnType<typeof createValidationSchema>>
type SubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>

type ExamCourseInput = AppActivityModalProps['course']

const getCourseUuid = (course?: ExamCourseInput | null): string | null =>
  course?.courseStructure?.course_uuid ?? course?.course_uuid ?? null

const getCreatedActivityUuid = (data: AppPayload): string | null =>
  data?.activity_uuid ??
  data?.activity?.activity_uuid ??
  data?.data?.activity_uuid ??
  data?.data?.activity?.activity_uuid ??
  null

type NewExamProps = Pick<AppActivityModalProps, 'chapterId' | 'course' | 'closeModal'> & {
  /** `quiz` keeps the server's quiz preset (no attempt cap, no proctoring); `exam` applies the exam preset. */
  kind: 'quiz' | 'exam'
}

function NewExam({ chapterId, course, closeModal, kind }: NewExamProps) {
  const validationT = useTranslations('Validation')
  // Locale-aware navigation (UX-029): a bare `/dash/…` would 307 through the proxy.
  const router = useRouter()
  const tModal = useTranslations('Components.NewExamModal')
  const t = (key: string) => tModal(key)
  const tk = (key: string) => tModal(`${kind}.${key}`)

  const validationSchema = createValidationSchema(validationT)
  const withUnpublishedActivities =
    typeof course?.withUnpublishedActivities === 'boolean' ? course.withUnpublishedActivities : false
  const courseUuid = getCourseUuid(course)
  const createExamMutation = useCreateExamWithActivity(courseUuid, {
    withUnpublishedActivities,
  })

  const form = useForm<FormValues, unknown, SubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      activity_name: '',
      exam_description: '',
      has_time_limit: true,
      time_limit: DEFAULT_TIME_LIMIT,
      shuffle_questions: true,
      allow_result_review: true,
    },
  })

  const hasTimeLimit = useWatch({
    control: form.control,
    name: 'has_time_limit',
    defaultValue: true,
  })

  const onSubmit = async (values: SubmitValues) => {
    const toastLoading = toast.loading(tk('creatingExam'))
    try {

      const settings = {
        time_limit: values.has_time_limit ? values.time_limit : null,
        shuffle_questions: values.shuffle_questions,
        shuffle_answers: true,
        allow_result_review: values.allow_result_review,
        ...(kind === 'exam'
          ? {
              attempt_limit: 1,
              copy_paste_protection: true,
              tab_switch_detection: true,
              devtools_detection: true,
              right_click_disable: true,
              fullscreen_enforcement: true,
              violation_threshold: 3,
            }
          : {}),
      }

      const data = await createExamMutation.mutateAsync({
        kind,
        activityName: values.activity_name,
        chapterId,
        examDescription: values.exam_description,
        settings,
      })

      toast.dismiss(toastLoading)
      toast.success(tk('examCreatedSuccessfully'))

      const createdActivityUuid = getCreatedActivityUuid(data)
      if (createdActivityUuid) {
        let courseUuidClean = courseUuid ? cleanCourseUuid(courseUuid) : null
        if (!courseUuidClean) {
          const parts = globalThis.location.pathname.split('/').filter(Boolean)
          const courseIndex = parts.indexOf('course')
          if (courseIndex !== -1 && parts.length > courseIndex + 1) {
            courseUuidClean = String(parts[courseIndex + 1])
          }
          const dashCourseIndex = parts.indexOf('courses')
          if (dashCourseIndex !== -1 && parts.length > dashCourseIndex + 1) {
            courseUuidClean = String(parts[dashCourseIndex + 1])
          }
        }

        if (courseUuidClean) {
          const activityUuidClean = cleanActivityUuid(createdActivityUuid)
          // A fresh assessment is unpublished, so the learner activity page
          // (which reads the published outline) cannot show it — go to the studio.
          router.push(`/dash/courses/${courseUuidClean}/activity/${activityUuidClean}/studio`)
        } else {
          router.push('/courses')
        }
      }

      closeModal()
    } catch (error: unknown) {
      toast.dismiss(toastLoading)
      toast.error(tk('errorCreatingExam'))
      console.error('Error creating exam:', error)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="activity_name">{t('activityName')}</FieldLabel>
        <Input id="activity_name" placeholder={tk('activityNamePlaceholder')} {...form.register('activity_name')} />
        <FieldDescription>{t('activityNameDescription')}</FieldDescription>
        <FieldError errors={[form.formState.errors.activity_name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="exam_description">{tk('examDescription')}</FieldLabel>
        <Textarea
          id="exam_description"
          placeholder={tk('examDescriptionPlaceholder')}
          {...form.register('exam_description')}
        />
        <FieldError errors={[form.formState.errors.exam_description]} />
      </Field>

      <Controller
        control={form.control}
        name="has_time_limit"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('enableTimeLimit')}</FieldLabel>
              <FieldDescription>{t('timeLimitDescription')}</FieldDescription>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />

      {hasTimeLimit && (
        <Controller
          control={form.control}
          name="time_limit"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>{t('timeLimitMinutes')}</FieldLabel>
              <Input
                id={field.name}
                type="number"
                min={TIME_LIMIT_MIN}
                max={TIME_LIMIT_MAX}
                placeholder="60"
                {...field}
                value={field.value ?? ''}
                onChange={e => {
                  field.onChange(e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10))
                }}
              />
              <FieldDescription>{t('timeLimitMinutesDescription')}</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      <Controller
        control={form.control}
        name="shuffle_questions"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('shuffleQuestions')}</FieldLabel>
              <FieldDescription>{t('shuffleQuestionsDescription')}</FieldDescription>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="allow_result_review"
        render={({ field }) => (
          <Field className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FieldLabel>{t('allowResultReview')}</FieldLabel>
              <FieldDescription>{t('allowResultReviewDescription')}</FieldDescription>
            </div>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={closeModal} disabled={form.formState.isSubmitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('creating') : tk('createExam')}
        </Button>
      </div>
    </form>
  )
}

export default NewExam
