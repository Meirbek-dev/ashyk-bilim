'use client'

import { useCallback } from 'react'
import { Controller } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'

import { useCourseCreateForm } from './useCourseCreateForm'
import { useCreateCourseMutation } from './useCreateCourseMutation'
import { BasicsSection, StructureSection, VisibilitySection, DestinationSection } from './CourseCreateSections'
import { CourseCreateReviewPanel } from './CourseCreateReviewPanel'
import { SourceCourseCombobox } from './SourceCourseCombobox'

export function CourseCreateForm() {
  const t = useTranslations('DashPage.CourseManagement.Create')
  const router = useRouter()

  const {
    form,
    title,
    description,
    structureMode,
    sourceCourseUuid,
    initialVisibility,
    destination,
    blockingReason,
    completedCount,
    totalRequired,
  } = useCourseCreateForm()

  const { mutate, isPending } = useCreateCourseMutation()

  const handleSubmit = form.handleSubmit(async values => {
    const sourceCourseUuidValue = values.sourceCourseUuid?.trim() || undefined
    const result = await mutate(
      {
        title: values.title,
        description: values.description,
        structureMode: values.structureMode,
        initialVisibility: values.initialVisibility,
        ...(sourceCourseUuidValue !== undefined && { sourceCourseUuid: sourceCourseUuidValue }),
      },
      values.destination,
    )

    if (result.status === 'error') {
      toast.error(result.message)
      return
    }

    if (result.status === 'partial') {
      toast.warning(
        t('toasts.partial', {
          imported: result.importedChapterCount,
          failed: result.failedChapterCount,
        }),
      )
    } else {
      toast.success(t('toasts.created'))
    }

    router.replace(result.destinationPath)
  })

  const handleCancel = useCallback(() => {
    router.push('/dash/courses')
  }, [router])

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={t('formLabel')} className="relative">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Left: form sections */}
        <div className="flex flex-col gap-6">
          <div className="bg-card rounded-lg border p-6">
            <BasicsSection
              register={form.register}
              {...(form.formState.errors.title !== undefined && { titleError: form.formState.errors.title })}
              {...(form.formState.errors.description !== undefined && {
                descriptionError: form.formState.errors.description,
              })}
              titleValue={title}
              descriptionValue={description}
              onDescriptionChange={val =>
                form.setValue('description', val, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })
              }
              onDescriptionBlur={() => form.trigger('description')}
            />
          </div>

          <div className="bg-card rounded-lg border p-6">
            <Controller
              control={form.control}
              name="structureMode"
              render={({ field }) => (
                <StructureSection
                  value={field.value}
                  onChange={val => {
                    field.onChange(val)
                    if (val !== 'copy-outline') {
                      form.setValue('sourceCourseUuid', '')
                    }
                  }}
                  sourceCourseCombobox={
                    <SourceCourseCombobox
                      id="source-course-combobox"
                      value={sourceCourseUuid ?? ''}
                      onSelect={(uuid, name) => {
                        form.setValue('sourceCourseUuid', uuid, { shouldDirty: true })
                        void name
                      }}
                    />
                  }
                />
              )}
            />
          </div>

          <div className="bg-card rounded-lg border p-6">
            <Controller
              control={form.control}
              name="initialVisibility"
              render={({ field }) => <VisibilitySection value={field.value} onChange={field.onChange} />}
            />
          </div>

          <div className="bg-card rounded-lg border p-6">
            <Controller
              control={form.control}
              name="destination"
              render={({ field }) => <DestinationSection value={field.value} onChange={field.onChange} />}
            />
          </div>

          {/* Mobile: inline review + actions */}
          <div className="xl:hidden">
            <Separator className="mb-6" />
            <CourseCreateReviewPanel
              title={title}
              structureMode={structureMode}
              sourceCourseUuid={sourceCourseUuid ?? ''}
              initialVisibility={initialVisibility}
              destination={destination}
              completedCount={completedCount}
              totalRequired={totalRequired}
              blockingReason={blockingReason}
              isPending={isPending}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          </div>
        </div>

        {/* Right: sticky review panel (desktop only) */}
        <div className="hidden xl:block">
          <div className="sticky top-6">
            <CourseCreateReviewPanel
              title={title}
              structureMode={structureMode}
              sourceCourseUuid={sourceCourseUuid ?? ''}
              initialVisibility={initialVisibility}
              destination={destination}
              completedCount={completedCount}
              totalRequired={totalRequired}
              blockingReason={blockingReason}
              isPending={isPending}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
