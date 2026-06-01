'use client'

import { BookOpen, Copy, Layers } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { CourseStructureMode, CourseInitialVisibility, CourseCreateDestination } from './course-create-types'
import type { FieldError as RHFFieldError, UseFormRegister } from 'react-hook-form'
import type { CourseCreateValues } from '@/schemas/courseSchemas'

// ---------------------------------------------------------------------------
// Basics section
// ---------------------------------------------------------------------------

interface BasicsSectionProps {
  register: UseFormRegister<CourseCreateValues>
  titleError?: RHFFieldError
  descriptionError?: RHFFieldError
  titleValue: string
  descriptionValue: string
  onDescriptionChange: (value: string) => void
  onDescriptionBlur: () => void
}

export function BasicsSection({
  register,
  titleError,
  descriptionError,
  titleValue,
  descriptionValue,
  onDescriptionChange,
  onDescriptionBlur,
}: BasicsSectionProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')
  const DESCRIPTION_MAX = 8000

  return (
    <section aria-labelledby="section-basics-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="section-basics-heading" className="text-foreground text-sm font-semibold">
          {t('sections.basics')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('sections.basicsHelp')}</p>
      </div>

      <Field>
        <FieldLabel htmlFor="course-title" data-invalid={!!titleError}>
          {t('basics.courseTitle')}
        </FieldLabel>
        <FieldContent>
          <Input
            id="course-title"
            autoComplete="off"
            placeholder={t('basics.courseTitlePlaceholder')}
            aria-describedby={titleError ? 'course-title-error' : undefined}
            aria-invalid={!!titleError}
            maxLength={100}
            {...register('title')}
          />
        </FieldContent>
        {titleError && <FieldError id="course-title-error" errors={[titleError]} />}
      </Field>

      <Field>
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel htmlFor="course-description" data-invalid={!!descriptionError}>
            {t('basics.description')}
          </FieldLabel>
          {titleValue.length > 0 || descriptionValue.length > 0 ? (
            <span
              className={cn(
                'text-muted-foreground text-xs tabular-nums',
                descriptionValue.length > DESCRIPTION_MAX * 0.9 && 'text-destructive',
              )}
            >
              {descriptionValue.length}/{DESCRIPTION_MAX}
            </span>
          ) : null}
        </div>
        <FieldDescription>{t('basics.descriptionHelp')}</FieldDescription>
        <FieldContent>
          <Textarea
            id="course-description"
            rows={4}
            placeholder={t('basics.descriptionPlaceholder')}
            aria-describedby={descriptionError ? 'course-description-error' : 'course-description-help'}
            aria-invalid={!!descriptionError}
            maxLength={DESCRIPTION_MAX}
            value={descriptionValue}
            onChange={e => onDescriptionChange(e.target.value)}
            onBlur={onDescriptionBlur}
          />
        </FieldContent>
        {descriptionError && <FieldError id="course-description-error" errors={[descriptionError]} />}
      </Field>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Starting Structure section
// ---------------------------------------------------------------------------

interface StructureSectionProps {
  value: CourseStructureMode
  onChange: (value: CourseStructureMode) => void
  sourceCourseCombobox: React.ReactNode
}

function StructureOption({
  id,
  value,
  title,
  description,
  icon: Icon,
  checked,
}: {
  id: string
  value: string
  title: string
  description: string
  icon: typeof BookOpen
  checked: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
        'border-border hover:bg-muted/40',
        checked && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5 shrink-0" />
      <Icon className={cn('mt-0.5 size-4 shrink-0', checked ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-medium', checked ? 'text-foreground' : 'text-muted-foreground')}>{title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</div>
      </div>
    </label>
  )
}

export function StructureSection({ value, onChange, sourceCourseCombobox }: StructureSectionProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')

  const options: { value: CourseStructureMode; title: string; description: string; icon: typeof BookOpen }[] = [
    {
      value: 'blank',
      title: t('structure.blank.title'),
      description: t('structure.blank.description'),
      icon: Layers,
    },
    {
      value: 'starter',
      title: t('structure.starter.title'),
      description: t('structure.starter.description'),
      icon: BookOpen,
    },
    {
      value: 'copy-outline',
      title: t('structure.copyOutline.title'),
      description: t('structure.copyOutline.description'),
      icon: Copy,
    },
  ]

  return (
    <section aria-labelledby="section-structure-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="section-structure-heading" className="text-foreground text-sm font-semibold">
          {t('sections.structure')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('sections.structureHelp')}</p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={val => onChange(val as CourseStructureMode)}
        className="flex flex-col gap-2"
      >
        {options.map(opt => (
          <StructureOption
            key={opt.value}
            id={`structure-${opt.value}`}
            value={opt.value}
            title={opt.title}
            description={opt.description}
            icon={opt.icon}
            checked={value === opt.value}
          />
        ))}
      </RadioGroup>

      {value === 'copy-outline' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="source-course-combobox" className="text-sm font-medium">
            {t('structure.copyOutline.sourceCourseLabel')}
          </Label>
          <p className="text-muted-foreground text-xs">{t('structure.copyOutline.sourceCourseHelp')}</p>
          {sourceCourseCombobox}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Visibility section
// ---------------------------------------------------------------------------

interface VisibilitySectionProps {
  value: CourseInitialVisibility
  onChange: (value: CourseInitialVisibility) => void
}

export function VisibilitySection({ value, onChange }: VisibilitySectionProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')

  return (
    <section aria-labelledby="section-visibility-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="section-visibility-heading" className="text-foreground text-sm font-semibold">
          {t('sections.visibility')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('sections.visibilityHelp')}</p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={val => onChange(val as CourseInitialVisibility)}
        className="flex flex-col gap-2"
      >
        {(
          [
            {
              value: 'private' as const,
              title: t('visibility.private.title'),
              description: t('visibility.private.description'),
            },
            {
              value: 'public' as const,
              title: t('visibility.public.title'),
              description: t('visibility.public.description'),
            },
          ] satisfies { value: CourseInitialVisibility; title: string; description: string }[]
        ).map(opt => (
          <label
            key={opt.value}
            htmlFor={`visibility-${opt.value}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
              'border-border hover:bg-muted/40',
              value === opt.value && 'border-primary bg-primary/5',
            )}
          >
            <RadioGroupItem id={`visibility-${opt.value}`} value={opt.value} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div
                className={cn('text-sm font-medium', value === opt.value ? 'text-foreground' : 'text-muted-foreground')}
              >
                {opt.title}
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{opt.description}</div>
            </div>
          </label>
        ))}
      </RadioGroup>

      {value === 'public' && (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          {t('visibility.public.warning')}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// After Creation (destination) section
// ---------------------------------------------------------------------------

interface DestinationSectionProps {
  value: CourseCreateDestination
  onChange: (value: CourseCreateDestination) => void
}

export function DestinationSection({ value, onChange }: DestinationSectionProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')

  return (
    <section aria-labelledby="section-destination-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="section-destination-heading" className="text-foreground text-sm font-semibold">
          {t('sections.afterCreation')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('sections.afterCreationHelp')}</p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={val => onChange(val as CourseCreateDestination)}
        className="flex flex-col gap-2"
      >
        {(
          [
            {
              value: 'overview' as const,
              title: t('destination.overview.title'),
              description: t('destination.overview.description'),
            },
            {
              value: 'curriculum' as const,
              title: t('destination.curriculum.title'),
              description: t('destination.curriculum.description'),
            },
          ] satisfies { value: CourseCreateDestination; title: string; description: string }[]
        ).map(opt => (
          <label
            key={opt.value}
            htmlFor={`destination-${opt.value}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
              'border-border hover:bg-muted/40',
              value === opt.value && 'border-primary bg-primary/5',
            )}
          >
            <RadioGroupItem id={`destination-${opt.value}`} value={opt.value} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div
                className={cn('text-sm font-medium', value === opt.value ? 'text-foreground' : 'text-muted-foreground')}
              >
                {opt.title}
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{opt.description}</div>
            </div>
          </label>
        ))}
      </RadioGroup>
    </section>
  )
}
