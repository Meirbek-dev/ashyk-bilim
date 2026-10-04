import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/shared/ui/alert-dialog'
import { Button } from '#/shared/ui/button'
import { Field, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { deleteCourseOptions } from '../queries'

/**
 * "Delete course": irreversible and cascading, so beyond ConfirmDialog the course name must be typed first (focus
 * starts on Cancel). After it the caller lands on the course list.
 */
export function DeleteCourse({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()
  const navigate = useNavigate()
  const remove = useMutation(deleteCourseOptions())
  const matches = typed.trim() === course.name.trim()
  const confirm = () =>
    remove.mutate(
      { path: { course_id: course.id } },
      {
        onSuccess: () => {
          toast.add({ title: m.studio_course_deleted() })
          void navigate({ to: '/teach/courses' })
        },
      },
    )
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) {
          setTyped('')
          remove.reset()
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" />}>{m.studio_course_delete()}</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.studio_course_delete_confirm_title({ name: course.name })}</AlertDialogTitle>
          <AlertDialogDescription>{m.studio_course_delete_hint()}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{m.studio_course_delete_name()}</FieldLabel>
          <Input id={id} value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} />
        </Field>
        {remove.error ? <ErrorAlert>{presentError(remove.error)}</ErrorAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {m.ui_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!matches || remove.isPending} onClick={confirm}>
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.studio_course_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
