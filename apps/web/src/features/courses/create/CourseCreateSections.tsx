'use client'

import { BookOpen, Copy, Layers } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { CourseStructureMode } from './course-create-types'

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
    <Label
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
    </Label>
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
