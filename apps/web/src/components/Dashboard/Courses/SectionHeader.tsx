'use client';

import { CourseStatusBadge } from './courseWorkflowUi';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface SectionHeaderProps {
  title: string;
  description?: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  children?: React.ReactNode;
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
  const tCommon = useTranslations('Common');

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {children}
        {isDirty ? <CourseStatusBadge status="unsaved" /> : null}
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || isSaving}
          onClick={onDiscard}
        >
          {tCommon('discard')}
        </Button>
        <Button
          type="button"
          disabled={!isDirty || isSaving}
          onClick={onSave}
        >
          {isSaving ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
