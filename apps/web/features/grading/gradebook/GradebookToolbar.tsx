'use client';

import { Download, Filter, RefreshCcw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GRADEBOOK_SAVED_FILTERS } from '@/features/grading/domain';
import type { CourseGradebookResponse, GradebookFilters } from '@/features/grading/domain';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function GradebookToolbar({
  data,
  filters,
  activityTypes,
  selectedCount,
  onFiltersChange,
  onExport,
  onRefresh,
}: {
  data: CourseGradebookResponse;
  filters: GradebookFilters;
  activityTypes: string[];
  selectedCount: number;
  onFiltersChange: (filters: GradebookFilters) => void;
  onExport: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('Features.Grading.Gradebook');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{data.course_name}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <SummaryTile
            label={t('summary.learners')}
            value={data.summary.student_count}
          />
          <SummaryTile
            label={t('summary.activities')}
            value={data.summary.activity_count}
          />
          <SummaryTile
            label={t('summary.needsGrading')}
            value={data.summary.needs_grading_count}
            tone="amber"
          />
          <SummaryTile
            label={t('summary.overdue')}
            value={data.summary.overdue_count}
            tone="rose"
          />
          <SummaryTile
            label={t('summary.selected')}
            value={selectedCount}
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
          >
            <RefreshCcw className="size-4" />
            {t('refresh')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExport}
          >
            <Download className="size-4" />
            {t('export')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              placeholder={t('searchLearner')}
              className="pl-9"
            />
          </div>
          <NativeSelect
            value={filters.activityType}
            onChange={(event) => onFiltersChange({ ...filters, activityType: event.target.value })}
            aria-label={t('activityType')}
          >
            <NativeSelectOption value="all">{t('allActivityTypes')}</NativeSelectOption>
            {activityTypes.map((type) => (
              <NativeSelectOption
                key={type}
                value={type}
              >
                {labelActivityType(t, type)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="text-muted-foreground size-4" />
          {GRADEBOOK_SAVED_FILTERS.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant={filters.savedFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => onFiltersChange({ ...filters, savedFilter: filter })}
            >
              {t(`savedFilters.${filter}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'amber' | 'rose';
}) {
  return (
    <div
      className={cn(
        'border-border rounded-md border px-3 py-2',
        tone === 'amber' && 'border-amber-200 bg-amber-50/60',
        tone === 'rose' && 'border-rose-200 bg-rose-50/60',
      )}
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export function labelActivityType(t: (key: string) => string, type: string) {
  const key = type.toLowerCase();
  if (key === 'type_assignment' || key === 'assignment') return t('activityTypes.assignment');
  if (key === 'type_exam' || key === 'exam') return t('activityTypes.exam');
  if (key === 'type_code_challenge' || key === 'code_challenge') return t('activityTypes.codeChallenge');
  if (key === 'type_dynamic' || key === 'quiz') return t('activityTypes.quiz');
  if (key === 'type_form' || key === 'form') return t('activityTypes.form');
  if (key === 'type_file' || key === 'file') return t('activityTypes.file');
  return type.replace('TYPE_', '').replaceAll('_', ' ');
}
