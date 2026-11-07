import { m } from '#/paraglide/messages'
import { SelectToggle } from '#/shared/components/select-toggle'

import { queueCsvHref } from '../model/exports'
import type { Work } from '../queries'
import type { QueueSearch } from '../route'
import { CsvLink } from './csv-link'
import { GroupFilter } from './group-filter'
import { LateToggle } from './late-toggle'

type QueueFilterRowProps = {
  ids: { courseId: string; activityId: string }
  search: QueueSearch
  courseId: string
  work: Work
  onGroup: (group: QueueSearch['group']) => void
  /** Picking rows for a bulk action; null: the reader may not grade, so there is nothing to pick for. */
  selecting: boolean | null
  onSelecting: (selecting: boolean) => void
}

/** The queue's filters beside the search: late only, a group, the CSV of the whole queue, «Выбрать несколько». */
export function QueueFilterRow({ ids, search, courseId, work, onGroup, selecting, onSelecting }: QueueFilterRowProps) {
  return (
    <>
      <LateToggle ids={ids} search={search} />
      <GroupFilter courseId={courseId} group={search.group} onGroup={onGroup} />
      <CsvLink href={queueCsvHref(work.kind, work.id)} />
      {selecting === null ? null : (
        <SelectToggle
          selecting={selecting}
          onChange={onSelecting}
          start={m.grading_select_start()}
          done={m.grading_select_done()}
        />
      )}
    </>
  )
}
