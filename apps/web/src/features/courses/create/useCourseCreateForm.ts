import { useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { courseCreateSchema } from '@/schemas/courseSchemas'
import type { CourseCreateValues } from '@/schemas/courseSchemas'
import { cleanCourseUuid } from '@/lib/course-management'

export const COURSE_TITLE_MAX = 100
export const COURSE_DESCRIPTION_MAX = 8000

export function useCourseCreateForm() {
  const searchParams = useSearchParams()

  const form = useForm<CourseCreateValues>({
    resolver: valibotResolver(courseCreateSchema),
    defaultValues: {
      title: '',
      description: '',
      structureMode: 'blank',
      sourceCourseUuid: '',
      initialVisibility: 'private',
      destination: 'overview',
    },
    mode: 'onBlur',
  })

  // Read URL params on mount to pre-populate structure mode
  useEffect(() => {
    const startParam = searchParams.get('start')
    const sourceParam = searchParams.get('source')

    if (startParam === 'outline' || startParam === 'copy-outline') {
      form.setValue('structureMode', 'copy-outline')
    } else if (startParam === 'starter') {
      form.setValue('structureMode', 'starter')
    }

    if (sourceParam?.trim()) {
      form.setValue('sourceCourseUuid', cleanCourseUuid(sourceParam))
      form.setValue('structureMode', 'copy-outline')
    }
  }, [form, searchParams])

  const title = useWatch({ control: form.control, name: 'title', defaultValue: '' })
  const description = useWatch({ control: form.control, name: 'description', defaultValue: '' })
  const structureMode = useWatch({ control: form.control, name: 'structureMode', defaultValue: 'blank' })
  const sourceCourseUuid = useWatch({ control: form.control, name: 'sourceCourseUuid', defaultValue: '' })
  const initialVisibility = useWatch({ control: form.control, name: 'initialVisibility', defaultValue: 'private' })
  const destination = useWatch({ control: form.control, name: 'destination', defaultValue: 'overview' })

  const isTitleFilled = title.trim().length > 0
  const isDescriptionFilled = description.trim().length > 0
  const isSourceRequired = structureMode === 'copy-outline'
  const isSourceFilled = Boolean(sourceCourseUuid?.trim())

  const blockingReason: string | null = !isTitleFilled
    ? 'title'
    : !isDescriptionFilled
      ? 'description'
      : isSourceRequired && !isSourceFilled
        ? 'source'
        : null

  const canSubmit = blockingReason === null

  const completedCount = [isTitleFilled, isDescriptionFilled, isSourceRequired ? isSourceFilled : true].filter(
    Boolean,
  ).length
  const totalRequired = isSourceRequired ? 3 : 2

  const resetSourceCourse = useCallback(() => {
    form.setValue('sourceCourseUuid', '')
  }, [form])

  return {
    form,
    title,
    description,
    structureMode,
    sourceCourseUuid,
    initialVisibility,
    destination,
    canSubmit,
    blockingReason,
    completedCount,
    totalRequired,
    resetSourceCourse,
  }
}
