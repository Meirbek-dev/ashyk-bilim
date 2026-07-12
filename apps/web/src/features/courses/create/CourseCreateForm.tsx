'use client'

import { Controller } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useCourseCreateForm } from './useCourseCreateForm'
import { useCreateCourseMutation } from './useCreateCourseMutation'
import { StructureSection } from './CourseCreateSections'
import { SourceCourseCombobox } from './SourceCourseCombobox'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export function CourseCreateForm() {
  const t = useTranslations('DashPage.CourseManagement.Create')
  const router = useRouter()
  const { form, structureMode, sourceCourseUuid } = useCourseCreateForm()
  const { mutate, isPending } = useCreateCourseMutation()

  const handleSubmit = form.handleSubmit(async values => {
    const sourceCourseUuidValue = values.sourceCourseUuid?.trim() || undefined
    const result = await mutate(
      {
        title: values.title,
        description: '',
        structureMode: values.structureMode,
        initialVisibility: 'private',
        ...(sourceCourseUuidValue ? { sourceCourseUuid: sourceCourseUuidValue } : {}),
      },
      'overview',
    )

    if (result.status === 'error') {
      toast.error(result.message)
      return
    }
    if (result.status === 'partial') {
      toast.warning(t('toasts.partial', { imported: result.importedChapterCount, failed: result.failedChapterCount }))
    } else {
      toast.success(t('toasts.created'))
    }
    router.replace(result.destinationPath)
  })

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={t('formLabel')} className="mx-auto max-w-3xl">
      <div className="bg-card flex flex-col gap-6 rounded-lg border p-5 sm:p-6">
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.title)}>
            <FieldLabel htmlFor="course-title">{t('basics.courseTitle')}</FieldLabel>
            <Input
              id="course-title"
              type="text"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.title)}
              placeholder={t('basics.courseTitlePlaceholder')}
              {...form.register('title')}
            />
            <FieldDescription>{t('quickCreateTitleHelp')}</FieldDescription>
            <FieldError errors={form.formState.errors.title ? [{ message: t('review.blockingReasons.title') }] : []} />
          </Field>
        </FieldGroup>

        <Controller
          control={form.control}
          name="structureMode"
          render={({ field }) => (
            <StructureSection
              value={field.value}
              onChange={value => {
                field.onChange(value)
                if (value !== 'copy-outline') form.setValue('sourceCourseUuid', '')
              }}
              sourceCourseCombobox={
                <SourceCourseCombobox
                  id="source-course-combobox"
                  value={sourceCourseUuid ?? ''}
                  onSelect={uuid => form.setValue('sourceCourseUuid', uuid, { shouldDirty: true })}
                />
              }
            />
          )}
        />

        {structureMode === 'copy-outline' && form.formState.errors.sourceCourseUuid ? (
          <FieldError>{t('review.blockingReasons.source')}</FieldError>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push('/dash/courses')}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            {isPending ? t('actions.creating') : t('actions.create')}
          </Button>
        </div>
      </div>
    </form>
  )
}
