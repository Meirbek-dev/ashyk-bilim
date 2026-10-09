'use client'

import { CourseStatusBadge } from './courseWorkflowUi'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface SectionHeaderProps {
  title: string
  description?: string
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onDiscard: () => void
  children?: React.ReactNode
}

/** Save/discard pinned to the bottom of the viewport while there are unsaved edits (long forms). */
export function StickySaveBar({ isDirty, isSaving, onSave, onDiscard }: Omit<SectionHeaderProps, 'title'>) {
  const tCommon = useTranslations('Common')
  if (!isDirty) return null
  return (
    <div className="bg-card/95 sticky bottom-0 z-10 -mb-(--card-spacing) flex items-center justify-end gap-3 rounded-b-xl border-t px-(--card-spacing) py-3 backdrop-blur">
      <CourseStatusBadge status="unsaved" />
      <Button type="button" variant="outline" disabled={isSaving} onClick={onDiscard}>
        {tCommon('discard')}
      </Button>
      <Button type="button" disabled={isSaving} onClick={onSave}>
        {isSaving ? tCommon('saving') : tCommon('save')}
      </Button>
    </div>
  )
}

/**
 * Shared section header with title, unsaved-changes indicator, Discard and Save buttons.
 * Used across all EditCourse* workspace sections to eliminate copy-pasted header boilerplate.
 */
export function SectionHeader({
  title,
  description,
  isDirty,
  isSaving,
  onSave,
  onDiscard,
  children,
}: SectionHeaderProps) {
  const tCommon = useTranslations('Common')

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h2 className="text-foreground text-xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {children}
        {isDirty ? <CourseStatusBadge status="unsaved" /> : null}
        <Button type="button" variant="outline" disabled={!isDirty || isSaving} onClick={onDiscard}>
          {tCommon('discard')}
        </Button>
        <Button type="button" disabled={!isDirty || isSaving} onClick={onSave}>
          {isSaving ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>
    </div>
  )
}
