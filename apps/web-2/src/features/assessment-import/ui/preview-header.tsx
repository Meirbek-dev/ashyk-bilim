import { m } from '#/paraglide/messages'
import type { AssessmentImport } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { type DotType, summaryCounts } from '../model/preview'
import type { CommitFormApi } from './use-commit-form'

const countLabels: Record<DotType, (input: { count: string }) => string> = {
  single: m.assessment_import_count_single,
  multiple: m.assessment_import_count_multiple,
  short: m.assessment_import_count_short,
  matching: m.assessment_import_count_matching,
  essay: m.assessment_import_count_essay,
}

/** «64 вопроса · 64 с одним ответом · 6 изображений». */
function counters({ summary }: Pick<AssessmentImport, 'summary'>): string {
  return [
    m.assessment_import_count_questions({ count: summary.questions }),
    ...summaryCounts(summary).map(({ type, count }) => countLabels[type]({ count: formatNumber(count) })),
    summary.images > 0 ? m.assessment_import_count_images({ count: summary.images }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

type PreviewHeaderProps = { form: CommitFormApi; imported: AssessmentImport; isNew: boolean }

/** File and sheet, the error and warning badges, the title (a new test's is editable), the counts. */
export function PreviewHeader({ form, imported, isNew }: PreviewHeaderProps) {
  const { summary } = imported
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 text-sm wrap-anywhere text-muted-foreground">
          {m.assessment_import_source({ file: imported.file_name, sheet: imported.sheet })}
        </p>
        {summary.errors > 0 ? (
          <StatusBadge tone="destructive">
            {m.assessment_import_errors_badge({ count: formatNumber(summary.errors) })}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success">{m.assessment_import_no_errors()}</StatusBadge>
        )}
        {summary.warnings > 0 ? (
          <StatusBadge tone="warning">
            {m.assessment_import_warnings_badge({ count: formatNumber(summary.warnings) })}
          </StatusBadge>
        ) : null}
      </div>
      {isNew ? (
        <form.AppField name="title">
          {field => <field.TextField label={m.assessment_import_field_title()} required />}
        </form.AppField>
      ) : imported.settings ? (
        <h2 className="text-xl font-semibold wrap-anywhere">{imported.settings.title}</h2>
      ) : null}
      <p className="text-sm">{counters(imported)}</p>
    </header>
  )
}
