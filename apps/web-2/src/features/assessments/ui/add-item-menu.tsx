import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'
import { Spinner } from '#/shared/ui/spinner'

import { newItem, newItemKinds, type NewItemKind } from '../model/items'
import { createItemOptions } from '../queries'
import { kindLabels } from './labels'

type AddItemMenuProps = { activityId: string; assessment: AssessmentDetail }

/** "Add question": the kinds the assessment allows; the new question is appended and opened. */
export function AddItemMenu({ activityId, assessment }: AddItemMenuProps) {
  const navigate = useNavigate()
  const create = useMutation(createItemOptions(useQueryClient(), activityId, assessment.id))
  const add = (kind: NewItemKind) =>
    create.mutate(
      {
        path: { assessment_id: assessment.id },
        body: newItem(kind, m.assessments_item_new_title({ number: assessment.items.length + 1 })),
      },
      { onSuccess: item => void navigate({ to: '.', search: previous => ({ ...previous, item: item.id }) }) },
    )
  return (
    <div className="flex flex-col gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" disabled={create.isPending} />}>
          {create.isPending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" aria-hidden />}
          {m.assessments_item_add()}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {newItemKinds(assessment.kind).map(kind => (
            <DropdownMenuItem key={kind} onClick={() => add(kind)}>
              {kindLabels[kind]()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {create.error ? <ErrorAlert>{presentError(create.error)}</ErrorAlert> : null}
    </div>
  )
}
