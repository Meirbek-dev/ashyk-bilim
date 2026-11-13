import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { AssessmentImport, CurriculumChapter } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { presentError } from '#/shared/i18n/errors'

import type { ImportDestination } from '../model/commit'
import { discardImportOptions, importOptions, keepImport } from '../queries'
import { FileStep } from './file-step'
import { ImportPreview } from './import-preview'

type ImportFlowProps = {
  courseId: string
  destination: ImportDestination
  chapters: readonly CurriculumChapter[]
  chapterId: string | undefined
  editable: boolean
  /** Back to where the teacher came from (the course content or the test). */
  leave: () => void
}

const goneText = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 410)
    ? m.assessment_import_gone()
    : presentError(error)

/**
 * File, then preview, then create. The previewed import is in the URL (`?import=`), so a reload or a step back keeps
 * it; another file or «Отменить» discards it on the server (an abandoned one expires there after 24 h anyway).
 */
export function ImportFlow({ courseId, destination, chapters, chapterId, editable, leave }: ImportFlowProps) {
  const { import: importId } = useSearch({ from: '/_authed/teach/courses/$courseId_/import' })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/import' })
  const queryClient = useQueryClient()
  const discard = useMutation(discardImportOptions())
  // The import changes only through this page's own writes, whose answers go into the cache.
  const current = useQuery({ ...importOptions(importId ?? ''), enabled: importId !== undefined, staleTime: 'static' })
  const show = (id: string | undefined) => navigate({ search: previous => ({ ...previous, import: id }) })
  const drop = () => {
    if (importId) discard.mutate({ path: { import_id: importId } })
  }
  const created = (imported: AssessmentImport) => {
    keepImport(queryClient, imported)
    void show(imported.id)
  }
  const fileStep = <FileStep courseId={courseId} onCreated={created} />
  if (!importId) return fileStep
  if (current.isPending) return <ListSkeleton />
  if (current.isError)
    return (
      <div className="flex flex-col gap-4">
        <ErrorAlert>{goneText(current.error)}</ErrorAlert>
        {fileStep}
      </div>
    )
  const imported = current.data
  if (imported.status === 'committed' && imported.result)
    return (
      <div className="flex flex-col items-start gap-3">
        <p>{m.assessment_import_committed()}</p>
        <RouterLink
          to="/teach/courses/$courseId/activities/$activityId/edit"
          params={{ courseId, activityId: imported.result.activity_id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {m.assessment_import_open_test()}
        </RouterLink>
      </div>
    )
  return (
    <ImportPreview
      // Another file starts the settings over; a re-read of the same one keeps what was typed.
      key={imported.id}
      courseId={courseId}
      imported={imported}
      destination={destination}
      chapters={chapters}
      chapterId={chapterId}
      editable={editable}
      onOtherFile={() => {
        drop()
        void show(undefined)
      }}
      onCancel={() => {
        drop()
        leave()
      }}
    />
  )
}
