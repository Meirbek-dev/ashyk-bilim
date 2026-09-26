'use client'

import { AlertTriangle, ArrowDown, ArrowUp, Image as ImageIcon, ListChecks, Plus, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field'
import type { CourseGeneralValues } from '@/schemas/courseSchemas'
import { CourseEditorNotice } from '@/features/courses/editor/components/CourseEditorNotice'
import {
  CourseEditorSection,
  CourseEditorStagedSection,
} from '@/features/courses/editor/components/CourseEditorSection'
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection'
import { useCourse } from '@components/Contexts/CourseContext'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { courseGeneralSchema } from '@/schemas/courseSchemas'
import { TagsInput } from '@components/ui/custom/tags-input'
import { useEffect, useId, useMemo, useState } from 'react'
import { useSaveSection } from '@/hooks/useSaveSection'
import { Controller, useForm } from 'react-hook-form'
import ThumbnailUpdate from './ThumbnailUpdate'
import { Input } from '@components/ui/input'
import { useTranslations } from 'next-intl'
import type * as v from 'valibot'
import { MarkdownEditor, getMarkdownSaveGate } from '@/features/content-markdown'
import { Spinner } from '@/components/ui/spinner'

function parseTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(tag => String(tag).trim()).filter(Boolean)
    } catch {
      // Fallback to legacy comma-separated data
    }
    return raw
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean)
  }
  return []
}

type LearningValue = CourseGeneralValues['learnings'][number]

/** The wire `Course.learnings` (`{id, text, emoji?}`) as form rows; `''` = no emoji. */
function parseLearnings(raw: unknown): LearningValue[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is { id: string; text: string; emoji?: string | null } =>
      Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.text === 'string'),
    )
    .map(({ id, text, emoji }) => ({ id, text, emoji: emoji ?? '' }))
}

function buildFormValues(courseStructure: AppCourse): CourseGeneralValues {
  return {
    name: courseStructure?.name || '',
    description: courseStructure?.description || '',
    about: courseStructure?.about || '',
    tags: parseTags(courseStructure?.tags),
    learnings: parseLearnings(courseStructure?.learnings),
  }
}

/** "What you'll learn" rows: text, optional emoji, reorder by buttons. */
function LearningsEditor({
  value,
  onChange,
  errors,
}: {
  value: LearningValue[]
  onChange: (next: LearningValue[]) => void
  errors: ({ text?: { message?: string } } | undefined)[] | undefined
}) {
  const t = useTranslations('CourseEdit.General.LearningItems')
  const validationT = useTranslations('Validation')
  const update = (index: number, patch: Partial<LearningValue>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const move = (from: number, to: number) => {
    const next = [...value]
    const [item] = next.splice(from, 1)
    if (item) next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-muted-foreground text-sm">{t('noItems')}</p>}
      {value.map((item, index) => {
        const message = errors?.[index]?.text?.message
        return (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                value={item.emoji}
                onChange={event => update(index, { emoji: event.target.value })}
                aria-label={t('changeEmojiAriaLabel')}
                placeholder="📝"
                maxLength={16}
                className="w-14 shrink-0 text-center"
              />
              <Input
                value={item.text}
                onChange={event => update(index, { text: event.target.value })}
                placeholder={t('placeholder')}
                maxLength={300}
                aria-invalid={Boolean(message)}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('moveUpAriaLabel')}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('moveDownAriaLabel')}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('removeItemAriaLabel')}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            {message && (
              <p className="text-destructive text-sm">
                {validationT.has(camelCase(message)) ? validationT(camelCase(message)) : message}
              </p>
            )}
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={value.length >= 30}
        onClick={() => onChange([...value, { id: crypto.randomUUID(), text: '', emoji: '' }])}
      >
        <Plus aria-hidden="true" />
        {t('addItemButton')}
      </Button>
    </div>
  )
}

const camelCase = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

function EditCourseGeneral() {
  const t = useTranslations('CourseEdit.General')
  const tCommon = useTranslations('Common')
  const [error, setError] = useState('')

  const course = useCourse()
  const { isLoading, courseStructure } = course
  const formId = useId()
  const { updateMetadata } = useCoursesMutations(courseStructure?.course_uuid ?? '')

  const serverValues = useMemo(() => buildFormValues(courseStructure), [courseStructure])

  type CourseGeneralInputValues = v.InferInput<typeof courseGeneralSchema>

  const form = useForm<CourseGeneralInputValues, unknown, CourseGeneralValues>({
    resolver: valibotResolver(courseGeneralSchema),
    defaultValues: serverValues,
    mode: 'onChange',
  })

  const { isDirty } = form.formState

  // Keep the global store's dirty map in sync — no separate state needed.
  useSyncDirtySection('general', isDirty)

  const { isSaving, saveWithoutRefresh } = useSaveSection({
    section: 'general',
    errorMessage: t('errors.saveFailed'),
    successMessage: tCommon('saved'),
    onError: setError,
  })

  // Hydrate form from server data on mount / when server data changes.
  // RHF's `reset` only runs when values actually differ, so it's cheap.
  useEffect(() => {
    if (!isLoading && courseStructure) {
      form.reset(serverValues, { keepDirtyValues: true })
    }
  }, [courseStructure, isLoading, serverValues, form])

  const handleSubmit = async (values: CourseGeneralValues) => {
    setError('')
    const descriptionGate = getMarkdownSaveGate(values.description, 'courseDescription', { intent: 'publish' })
    if (!descriptionGate.canSave) {
      setError(descriptionGate.errors[0]?.message ?? t('errors.saveFailed'))
      return
    }

    await saveWithoutRefresh(
      async () =>
        updateMetadata(values, {
          lastKnownUpdateDate: course.courseStructure.update_date,
        }),
      {
        onSuccess: () => {
          form.reset(values)
          setError('')
        },
      },
    )
  }

  const handleDiscard = () => {
    form.reset(serverValues)
    setError('')
  }

  if (isLoading || !courseStructure) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <Spinner className="size-5" />
          <span>{t('loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6" role="main">
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-6" noValidate>
        {error && (
          <Alert variant="destructive" id={`${formId}-error`}>
            <AlertTriangle className="size-4" aria-hidden="true" />
            <AlertTitle>{t('errors.saveFailed')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <CourseEditorStagedSection
          title={t('title', { courseName: courseStructure.name || '' })}
          description={t('subtitle')}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={() => form.handleSubmit(handleSubmit)()}
          onDiscard={handleDiscard}
          contentClassName="gap-6"
        >
          <div className="flex flex-col gap-6">
            <Field>
              <FieldLabel className="text-base font-semibold" htmlFor="name">
                {t('name.label')}
              </FieldLabel>
              <FieldContent>
                <Input
                  {...form.register('name')}
                  id="name"
                  placeholder={t('name.placeholder')}
                  className="text-lg"
                  maxLength={100}
                />
              </FieldContent>
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel className="text-base font-semibold" htmlFor="description">
                {t('description.label')}
              </FieldLabel>
              <FieldContent>
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <MarkdownEditor
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      preset="courseDescription"
                      placeholder={t('description.placeholder')}
                    />
                  )}
                />
              </FieldContent>
              <FieldError errors={[form.formState.errors.description]} />
            </Field>

            {/*<Field>
                <FieldLabel
                  className="text-base font-semibold"
                  htmlFor="about"
                >
                  {t('about.label')}
                </FieldLabel>
                <FieldContent>
                  <Textarea
                    {...form.register('about')}
                    id="about"
                    placeholder={t('about.placeholder')}
                    className="min-h-[120px]"
                  />
                </FieldContent>
                <FieldError errors={[form.formState.errors.about]} />
              </Field> */}

            <Controller
              control={form.control}
              name="tags"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel className="flex items-center gap-2 text-base font-semibold">
                    <Tag className="h-4 w-4" aria-hidden="true" />
                    {t('tags.label')}
                  </FieldLabel>
                  <TagsInput
                    placeholder={t('tags.placeholder')}
                    value={field.value || []}
                    onValueChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="learnings"
              render={({ field }) => (
                <Field>
                  <FieldLabel className="flex items-center gap-2 text-base font-semibold">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    {t('learnings.label')}
                  </FieldLabel>
                  <LearningsEditor
                    value={field.value ?? []}
                    onChange={field.onChange}
                    errors={
                      Array.isArray(form.formState.errors.learnings) ? form.formState.errors.learnings : undefined
                    }
                  />
                  <FieldError errors={[form.formState.errors.learnings?.root]} />
                </Field>
              )}
            />
          </div>
        </CourseEditorStagedSection>

        <CourseEditorSection
          title={t('thumbnail.label')}
          description={t('thumbnail.mediaUpdatesIsolated')}
          contentClassName="gap-6"
        >
          <CourseEditorNotice
            icon={ImageIcon}
            title={t('thumbnail.mediaActionsTitle')}
            description={t('thumbnail.mediaActionsDescription')}
          />

          <ThumbnailUpdate />
        </CourseEditorSection>
      </form>
    </div>
  )
}

export default EditCourseGeneral
