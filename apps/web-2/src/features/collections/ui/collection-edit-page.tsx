import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UpdateCollectionRequest } from '#/shared/api/gen/types.gen'
import { vUpdateCollectionRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Link } from '#/shared/components/link'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/collections'
import { collectionOptions, updateCollectionOptions } from '../queries'

/** The one edit place of a collection. Saves with `If-Match: version`; a 412 opens the conflict dialog. */
export function CollectionEditPage() {
  const { collectionId } = useParams({ from: '/_authed/collections/$collectionId/edit' })
  const query = useSuspenseQuery(collectionOptions(collectionId))
  const navigate = useNavigate()
  const update = useMutation(updateCollectionOptions(useQueryClient(), collectionId))
  const [conflict, setConflict] = useState(false)
  // Captured once: a reload after a conflict must not reset what the user typed.
  const [defaultValues] = useState<UpdateCollectionRequest>(() => ({
    name: query.data.name,
    description: query.data.description,
    public: query.data.public,
  }))
  const request = (body: UpdateCollectionRequest, version: number) => ({
    path: { collection_id: collectionId },
    body,
    headers: { 'If-Match': version },
  })
  const callbacks = {
    onSuccess: async () => {
      setConflict(false)
      toast.add({ title: m.collections_saved() })
      await navigate({ to: '/collections/$collectionId', params: { collectionId } })
    },
    onError: (error: unknown) => setConflict(isStale(error)),
  }
  const form = useAppForm(vUpdateCollectionRequest, {
    defaultValues,
    onSubmit: body => update.mutateAsync(request(body, query.data.version), callbacks),
  })
  const reloadAndRetry = async () => {
    const fresh = await query.refetch()
    if (fresh.data) update.mutate(request(form.state.values, fresh.data.version), callbacks)
  }
  const back = (
    <Link to="/collections/$collectionId" params={{ collectionId }}>
      {m.collections_back()}
    </Link>
  )
  return (
    <DetailPage title={m.collections_edit_title()} meta={back}>
      <SettingsSection
        title={m.collections_edit_section()}
        description={m.collections_edit_section_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending && !conflict}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="name">
          {field => <field.TextField label={m.collections_field_name()} required />}
        </form.AppField>
        <form.AppField name="description">
          {field => <field.TextareaField label={m.collections_field_description()} />}
        </form.AppField>
        <form.AppField name="public">
          {field => (
            <field.SwitchField label={m.collections_field_public()} description={m.collections_field_public_hint()} />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onRetry={() => void reloadAndRetry()}
        pending={update.isPending || query.isFetching}
      />
    </DetailPage>
  )
}
