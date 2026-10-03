import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Link } from '#/shared/components/link'
import { presentError } from '#/shared/i18n/errors'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/shared/ui/alert-dialog'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { ATTEMPT_PATH } from './attempt-frame'

type SubmitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  unanswered: { item: AssessmentItem; number: number }[]
  onSubmit: () => void
  pending: boolean
  error: unknown
}

/** The hand-in confirmation (B-ATT-16): the unanswered questions, each a link to itself; errors stay in the dialog. */
export function SubmitDialog({ open, onOpenChange, unanswered, onSubmit, pending, error }: SubmitDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={next => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.attempt_submit_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.attempt_submit_text()}</AlertDialogDescription>
        </AlertDialogHeader>
        {unanswered.length ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">{m.attempt_unanswered({ count: unanswered.length })}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {unanswered.map(({ item, number }) => (
                <li key={item.id}>
                  <Link
                    from={ATTEMPT_PATH}
                    to="."
                    search={search => ({ ...search, item: number })}
                    onClick={() => onOpenChange(false)}
                  >
                    {m.attempt_question_number({ number })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm">{m.attempt_all_answered()}</p>
        )}
        {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">{m.ui_cancel()}</AlertDialogCancel>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {m.attempt_submit()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
