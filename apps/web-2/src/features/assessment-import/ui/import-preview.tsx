import { m } from '#/paraglide/messages'
import type { AssessmentImport, CurriculumChapter } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import type { ImportDestination } from '../model/commit'
import { issuesByRow } from '../model/issues'
import { previewRows } from '../model/preview'
import { CommitActions } from './commit-actions'
import { IssuesPanel } from './issues-panel'
import { PreviewHeader } from './preview-header'
import { QuestionCard } from './question-card'
import { SettingsSection } from './settings-section'
import { useCommitForm } from './use-commit-form'

type ImportPreviewProps = {
  courseId: string
  imported: AssessmentImport
  destination: ImportDestination
  /** A new test: the chapters it may go to, and the one picked before (the chapter's «Add»). */
  chapters: readonly CurriculumChapter[]
  chapterId: string | undefined
  /** An existing test: whether it takes questions now (an editable draft). */
  editable: boolean
  onOtherFile: () => void
  onCancel: () => void
}

/**
 * Step 2: what the file will become. The header and its counts, the issues (errors block the create), the settings of
 * row 1, the actions (before the list: a file may hold 1000 questions), then every question as it will be created.
 */
export function ImportPreview(props: ImportPreviewProps) {
  const { courseId, imported, destination, chapters, chapterId, editable, onOtherFile, onCancel } = props
  const isNew = destination.into === 'new'
  const preselected = chapters.find(chapter => chapter.id === chapterId)?.id ?? chapters[0]?.id
  const { form, commit } = useCommitForm({ courseId, imported, destination, chapterId: preselected })
  const rows = issuesByRow(imported.issues)
  return (
    <form
      className="flex flex-col gap-gutter"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <PreviewHeader form={form} imported={imported} isNew={isNew} />
      {imported.issues.length > 0 ? <IssuesPanel imported={imported} /> : null}
      <SettingsSection form={form} imported={imported} isNew={isNew} chapters={chapters} />
      <CommitActions
        form={form}
        isNew={isNew}
        pending={commit.isPending}
        error={commit.error}
        hasErrors={imported.summary.errors > 0 || imported.status !== 'ready'}
        noPlace={isNew ? chapters.length === 0 : !editable}
        onOtherFile={onOtherFile}
        onCancel={onCancel}
      />
      <section aria-labelledby="import-questions-title" className="flex flex-col gap-3">
        <h2 id="import-questions-title" className="text-lg font-semibold">
          {m.assessment_import_questions_title()} ({formatNumber(imported.items.length)})
        </h2>
        <ol className="flex flex-col gap-3">
          {previewRows(imported.items, rows.keys()).map(({ row, item }) => (
            <QuestionCard key={row} importId={imported.id} row={row} item={item} issues={rows.get(row)} />
          ))}
        </ol>
      </section>
    </form>
  )
}
