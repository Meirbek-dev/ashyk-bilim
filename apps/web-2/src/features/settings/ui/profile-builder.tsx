import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { ProfileSections } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'
import { toast } from '#/shared/ui/toast'

import { ADDABLE_SECTIONS, newSection, normalizeSections, vBuilderDocument } from '../model/profile-sections'
import { isStale } from '../model/settings'
import { profileOptions, updateProfileOptions } from '../queries'
import { SectionEditor, sectionTypeLabels } from './section-editor'

const useBuilderForm = (defaultValues: ProfileSections, onSubmit: (value: ProfileSections) => unknown) =>
  useAppForm(vBuilderDocument, { defaultValues, onSubmit, leaveGuard: true })

export type BuilderForm = ReturnType<typeof useBuilderForm>

/** The public profile document: sections added, ordered and filled here, saved as a whole with If-Match. */
export function ProfileBuilder() {
  const query = useSuspenseQuery(profileOptions())
  const update = useMutation(updateProfileOptions(useQueryClient()))
  const [conflict, setConflict] = useState(false)
  // Captured once: a reload after a conflict must not reset what the user typed.
  const [defaultValues] = useState(() => query.data.profile)
  // "Reload and retry" reads the current version and submits through the form (its leave guard): the version read
  // is used by that submit, before the refetched profile has rendered.
  const retryVersion = useRef<number | null>(null)
  const save = (document: ProfileSections) => {
    const version = retryVersion.current ?? query.data.version
    retryVersion.current = null
    return update.mutateAsync(
      { body: { profile: normalizeSections(document) }, version },
      {
        onSuccess: () => {
          setConflict(false)
          toast.add({ title: m.settings_saved() })
        },
        onError: error => setConflict(isStale(error)),
      },
    )
  }
  const form = useBuilderForm(defaultValues, save)
  // A section just added from the menu: the menu hands focus to its title, not back to «Добавить раздел».
  const [added, setAdded] = useState<string | null>(null)
  const addedTitle = useRef<HTMLDivElement>(null)
  const reloadAndRetry = async () => {
    retryVersion.current = (await query.refetch()).data?.version ?? null
    await form.handleSubmit()
  }
  return (
    <SettingsSection
      title={m.settings_builder_title()}
      description={m.settings_builder_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending && !conflict}
      error={isStale(update.error) ? null : update.error}
    >
      <form.Field name="sections" mode="array">
        {field => (
          <>
            {field.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.settings_builder_empty()}</p>
            ) : null}
            {field.state.value.map((section, index) => (
              <SectionEditor
                key={section.id}
                form={form}
                index={index}
                section={section}
                last={index === field.state.value.length - 1}
                titleRef={section.id === added ? addedTitle : undefined}
                onMove={delta => field.moveValue(index, index + delta)}
                onRemove={() => field.removeValue(index)}
              />
            ))}
            <div>
              <DropdownMenu onOpenChange={open => open && setAdded(null)}>
                <DropdownMenuTrigger render={<Button variant="outline">{m.settings_builder_add()}</Button>} />
                <DropdownMenuContent align="end" finalFocus={addedTitle}>
                  {ADDABLE_SECTIONS.map(type => ({
                    label: sectionTypeLabels[type](),
                    onSelect: () => {
                      const id = crypto.randomUUID()
                      setAdded(id)
                      field.pushValue(newSection(type, id, sectionTypeLabels[type]()))
                    },
                  })).map(action => (
                    <DropdownMenuItem key={action.label} onClick={action.onSelect}>
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </form.Field>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onRetry={() => void reloadAndRetry()}
        pending={update.isPending || query.isFetching}
      />
    </SettingsSection>
  )
}
