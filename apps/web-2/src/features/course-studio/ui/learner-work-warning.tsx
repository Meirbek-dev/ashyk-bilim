import { TriangleAlert } from 'lucide-react'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseDeletionPreview } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel } from '#/shared/ui/field'

type Props = { preview: CourseDeletionPreview; acknowledged: boolean; onAcknowledge: (checked: boolean) => void }

/**
 * What deleting the course takes with it (B-CST-52), from the deletion preview, archiving as the way to keep it, and
 * the box the teacher ticks to acknowledge it.
 */
export function LearnerWorkWarning({ preview, acknowledged, onAcknowledge }: Props) {
  const id = useId()
  return (
    <>
      <Alert>
        <TriangleAlert aria-hidden className="text-warning" />
        <AlertTitle>{m.studio_course_delete_work_title()}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc ps-4">
            <li>{m.studio_course_delete_work_learners({ count: formatNumber(preview.learners) })}</li>
            <li>{m.studio_course_delete_work_submissions({ count: formatNumber(preview.submissions) })}</li>
            <li>{m.studio_course_delete_work_files({ count: formatNumber(preview.file_attempts) })}</li>
            <li>{m.studio_course_delete_work_certificates({ count: formatNumber(preview.certificates) })}</li>
          </ul>
          <p>{m.studio_course_delete_work_archive()}</p>
        </AlertDescription>
      </Alert>
      <Field orientation="horizontal">
        <Checkbox id={id} checked={acknowledged} onCheckedChange={checked => onAcknowledge(checked)} />
        <FieldLabel htmlFor={id} className="font-normal">
          {m.studio_course_delete_acknowledge()}
        </FieldLabel>
      </Field>
    </>
  )
}
