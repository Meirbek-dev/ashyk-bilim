import { useMutation } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { Label } from '#/shared/ui/label'
import { Textarea } from '#/shared/ui/textarea'
import { toast } from '#/shared/ui/toast'

import { readyAttachments, sendBlocker } from '../model/attachments'
import { bulkSummary, initialPicks, type BulkPerson } from '../model/bulk'
import { MAX_BODY } from '../model/feed'
import { bulkOptions } from '../queries'
import { AttachButton } from './attach-button'
import { BulkPeople } from './bulk-people'
import { PendingFiles } from './pending-files'
import { useAttachments } from './use-attachments'

type BulkWriteProps = {
  courseId: string
  /** The learners shown (the list's current page and search). */
  people: readonly BulkPerson[]
  /** Record a `message_sent` intervention for each (from analytics). */
  intervention?: boolean
  label: string
}

/**
 * One message to several learners of a course (docs/DIALOGS.md 12): a separate message in each conversation. Those
 * who cannot be written to are skipped and counted in the toast. One key per open dialog: a retry after a lost answer
 * sends nothing twice.
 */
export function BulkWrite({ courseId, people, intervention = false, label }: BulkWriteProps) {
  const [open, setOpen] = useState(false)
  const [picks, setPicks] = useState(() => initialPicks(people))
  const [text, setText] = useState('')
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID())
  const files = useAttachments()
  const send = useMutation(bulkOptions())
  const boxId = useId()
  const reset = () => {
    setPicks(initialPicks(people))
    setText('')
    files.clear()
    setClientKey(crypto.randomUUID())
    send.reset()
  }
  const blocked = sendBlocker(text, files.files) !== null || picks.size === 0
  const submit = async () => {
    if (blocked) return
    // The dialog shows a failure (`error`) and keeps the key for «Отправить» again.
    const result = await send
      .mutateAsync({
        body: {
          course_id: courseId,
          to_user_ids: [...picks],
          body: text,
          client_key: clientKey,
          attachments: readyAttachments(files.files),
          ...(intervention ? { intervention: true } : {}),
        },
      })
      .catch(() => null)
    if (!result) return
    setOpen(false)
    reset()
    toast.add({ title: bulkSummary(result) })
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) reset()
      }}
      trigger={
        <Button variant="outline">
          <Users aria-hidden />
          {label}
        </Button>
      }
      title={label}
      submitLabel={m.conversations_bulk_send({ count: picks.size })}
      onSubmit={submit}
      pending={send.isPending}
      error={send.error}
    >
      <BulkPeople people={people} picks={picks} onChange={setPicks} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={boxId}>{m.conversations_bulk_text()}</Label>
        <Textarea id={boxId} value={text} onChange={e => setText(e.target.value)} maxLength={MAX_BODY} rows={4} />
        <PendingFiles files={files.files} onRemove={files.remove} onRetry={files.retry} />
        <div className="flex items-center gap-2">
          <AttachButton count={files.files.length} onFiles={files.add} />
          <p className="text-xs text-muted-foreground">
            {intervention ? m.conversations_intervention_hint() : m.conversations_bulk_hint()}
          </p>
        </div>
      </div>
    </FormDialog>
  )
}
