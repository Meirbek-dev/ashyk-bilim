import { useMutation } from '@tanstack/react-query'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { FileButton } from '#/shared/components/file-button'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { decodeCsv, MAX_ROSTER, MAX_ROSTER_FILE_BYTES, parsePasted, parseRosterCsv, summarize } from '../model/roster'
import { enrollLearnersOptions } from '../people-queries'
import { EnrollReport } from './enroll-report'

const schema = v.object({
  list: v.pipe(
    v.string(),
    v.check(
      text => parsePasted(text).length > 0,
      () => m.studio_roster_required(),
    ),
    v.check(
      text => parsePasted(text).length <= MAX_ROSTER,
      issue => m.studio_roster_too_many({ max: MAX_ROSTER, count: parsePasted(issue.input).length }),
    ),
  ),
})

/**
 * B-CST-39 Roster managers add people who already have an account: emails or usernames pasted or read from a CSV
 * into the field, one request; the report counts each outcome and names who was not added.
 */
export function EnrollLearners({ courseId }: { courseId: string }) {
  const enroll = useMutation(enrollLearnersOptions(courseId))
  // The dry run (B-CST-46): the same outcomes per identifier, nothing written.
  const check = useMutation(enrollLearnersOptions(courseId))
  const form = useAppForm(schema, {
    defaultValues: { list: '' },
    onSubmit: ({ list }) =>
      enroll.mutateAsync(
        { path: { course_id: courseId }, body: { identifiers: parsePasted(list) } },
        {
          onSuccess: result => {
            check.reset()
            form.reset()
            toast.add({ title: m.studio_roster_done({ count: summarize(result.results).counts.enrolled }) })
          },
        },
      ),
  })
  const readCsv = async (file: File) => {
    const fail = (text: string) =>
      form.setFieldMeta('list', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: text } }))
    if (file.size > MAX_ROSTER_FILE_BYTES) return fail(m.studio_roster_csv_too_large())
    const identifiers = parseRosterCsv(decodeCsv(await file.arrayBuffer()))
    if (identifiers.length === 0) return fail(m.studio_roster_csv_empty())
    form.setFieldValue('list', identifiers.join('\n'))
    form.setFieldMeta('list', meta => ({ ...meta, errorMap: {} }))
  }
  return (
    <form
      noValidate
      aria-label={m.studio_roster_title()}
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_roster_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_roster_hint({ max: MAX_ROSTER })}</p>
      </div>
      <form.AppField name="list">{field => <field.TextareaField label={m.studio_roster_field()} />}</form.AppField>
      <div className="flex flex-wrap items-center gap-2">
        <FileButton
          label={m.studio_roster_csv()}
          accept=".csv,text/csv,text/plain"
          onFile={file => void readCsv(file)}
        />
        <p className="text-sm text-muted-foreground">{m.studio_roster_csv_hint()}</p>
      </div>
      {(enroll.error ?? check.error) ? <ErrorAlert>{presentError(enroll.error ?? check.error)}</ErrorAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enroll.isPending}>
          {enroll.isPending ? <Spinner data-icon="inline-start" /> : null}
          {m.studio_roster_submit()}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={check.isPending}
          onClick={() => {
            const identifiers = parsePasted(form.state.values.list)
            if (identifiers.length > 0)
              check.mutate({ path: { course_id: courseId }, body: { identifiers, dry_run: true } })
          }}
        >
          {check.isPending ? <Spinner data-icon="inline-start" /> : null}
          {m.studio_roster_check()}
        </Button>
      </div>
      {check.data ? <EnrollReport result={check.data} preview /> : null}
      {enroll.data ? <EnrollReport result={enroll.data} /> : null}
    </form>
  )
}
