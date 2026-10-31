import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { ConceptGraph, ConceptId, CourseId } from '#/shared/api/gen/types.gen'
import { MultiCombobox, type ComboboxOption } from '#/shared/components/multi-combobox'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { prerequisiteChoices, requiredIds } from '../model/graph'
import { prerequisitesOptions } from '../queries'

type PrerequisitesEditorProps = { courseId: CourseId; graph: ConceptGraph; conceptId: ConceptId }

/**
 * What a concept requires (B-CON-07): chips of other concepts, «Save» replaces the whole set. A cycle is refused by the
 * server (`concept-cycle`); its text stays under the field and the choice is kept for a fix.
 */
export function PrerequisitesEditor({ courseId, graph, conceptId }: PrerequisitesEditorProps) {
  const options: ComboboxOption[] = prerequisiteChoices(graph, conceptId).map(concept => ({
    value: concept.id,
    label: concept.name,
  }))
  const [value, setValue] = useState<ComboboxOption[]>(() =>
    requiredIds(graph, conceptId).flatMap(id => options.find(option => option.value === id) ?? []),
  )
  const save = useMutation(prerequisitesOptions(courseId))
  return (
    <div className="flex flex-col gap-2">
      <MultiCombobox
        label={m.concepts_prerequisites_label()}
        description={m.concepts_prerequisites_hint()}
        options={options}
        value={value}
        onValueChange={next => {
          setValue(next)
          save.reset()
        }}
        error={save.error ? presentError(save.error) : undefined}
      />
      <div>
        <SubmitButton
          variant="outline"
          pending={save.isPending}
          onClick={() =>
            save.mutate(
              {
                path: { course_id: courseId, concept_id: conceptId },
                body: { requires: value.map(option => option.value) },
              },
              { onSuccess: () => toast.add({ title: m.concepts_saved() }) },
            )
          }
        >
          {m.concepts_prerequisites_save()}
        </SubmitButton>
      </div>
    </div>
  )
}
