import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { presentError } from '#/shared/i18n/errors'
import { toDateTimeInput } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { rosterCsv } from '../model/roster'
import { allLearners } from '../people-queries'

/** B-CST-40 Every learner of the course as a CSV that Excel opens (name, username, email, dates, progress). */
export function ExportLearners({ courseId, courseName }: { courseId: string; courseName: string }) {
  const save = useMutation({
    mutationFn: async () => {
      const learners = await allLearners(courseId)
      const header = [
        m.studio_roster_col_name(),
        m.studio_roster_col_username(),
        m.studio_roster_col_email(),
        m.studio_roster_col_enrolled(),
        m.studio_roster_col_progress(),
        m.studio_roster_col_completed(),
      ]
      const text = rosterCsv(header, learners, unix => toDateTimeInput(unix).slice(0, 10), getLocale() === 'en')
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${m.studio_roster_filename({ course: courseName }).replaceAll(/[\\/:*?"<>|]+/g, '_')}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    meta: { invalidates: [] },
  })
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : <Download aria-hidden data-icon="inline-start" />}
          {m.studio_roster_export()}
        </Button>
      </div>
      {save.error ? <p className="text-sm text-destructive">{presentError(save.error)}</p> : null}
    </div>
  )
}
