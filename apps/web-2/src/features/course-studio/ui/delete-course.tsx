import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Course } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import {
  AlertDialog,
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
import { toast } from '#/shared/ui/toast'

import { hasLearnerWork } from '../model/studio'
import { deleteCourseOptions, deletionPreviewOptions } from '../queries'
import { LearnerWorkWarning } from './learner-work-warning'

/**
 * "Delete course": irreversible and cascading, so beyond ConfirmDialog the course name must be typed first (focus
 * starts on Cancel). A course with learner work (the deletion preview, read again on open) also needs the box
 * acknowledging that the work, grades and certificates go with it (B-CST-52); a 409 `course-has-learner-work` (work
 * arrived after the preview) reads it again so the box appears (B-CST-53). After it the caller lands on the course list.
 */
export function DeleteCourse({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()
  const navigate = useNavigate()
  const { data: preview, refetch, isFetching } = useSuspenseQuery(deletionPreviewOptions(course.id))
  const remove = useMutation(deleteCourseOptions())
  const matches = typed.trim() === course.name.trim()
  const work = hasLearnerWork(preview)
  const confirm = () =>
    remove.mutate(
      {
        path: { course_id: course.id },
        headers: { 'If-Match': course.version },
        ...(work && acknowledged ? { query: { acknowledge_learner_work: true } } : {}),
      },
      {
        onSuccess: () => {
          toast.add({ title: m.studio_course_deleted() })
          void navigate({ to: '/teach/courses' })
        },
        onError: error => {
          if (error instanceof ApiError && error.code === 'course-has-learner-work') void refetch()
        },
      },
    )
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) void refetch()
        else {
          setTyped('')
          setAcknowledged(false)
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
        {work ? (
          <LearnerWorkWarning preview={preview} acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
        ) : null}
        <Field>
          <FieldLabel htmlFor={id}>{m.studio_course_delete_name()}</FieldLabel>
          <Input id={id} value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} />
        </Field>
        {remove.error ? <ErrorAlert>{presentError(remove.error)}</ErrorAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">
            {m.ui_cancel()}
          </AlertDialogCancel>
          <SubmitButton
            variant="destructive"
            pending={remove.isPending}
            disabled={!matches || isFetching || (work && !acknowledged)}
            onClick={confirm}
          >
            {m.studio_course_delete()}
          </SubmitButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
