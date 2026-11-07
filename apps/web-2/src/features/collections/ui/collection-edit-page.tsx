import { useParams } from '@tanstack/react-router'
import { Suspense } from 'react'

import { SwitchRows, TypesetSection } from '#/features/settings'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { Skeleton } from '#/shared/ui/skeleton'

import { isStale } from '../model/collections'
import { CoursePicker } from './course-picker'
import { CoverSection } from './cover-section'
import { useCollectionEdit } from './use-collection-edit'

/** The one edit place of a collection. Saves with `If-Match: version`; a 412 opens the conflict dialog. */
export function CollectionEditPage() {
  const { collectionId } = useParams({ from: '/_authed/collections/$collectionId/edit' })
  const { query, update, form, base, conflict, setConflict, reloadAndRetry } = useCollectionEdit(collectionId)
  const back = (
    <Link to="/collections/$collectionId" params={{ collectionId }} activeOptions={{ exact: true }}>
      {m.collections_back()}
    </Link>
  )
  return (
    <DetailPage title={m.collections_edit_title()} meta={back}>
      <div className="flex flex-col gap-12 pt-2">
        <TypesetSection
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
          <SwitchRows>
            <form.AppField name="public">
              {field => (
                <field.SwitchField
                  label={m.collections_field_public()}
                  description={m.collections_field_public_hint()}
                />
              )}
            </form.AppField>
          </SwitchRows>
          <form.Field name="courses">
            {field => (
              <Suspense fallback={<Skeleton className="h-row w-full" />}>
                <CoursePicker initial={query.data.courses} onChange={field.handleChange} />
              </Suspense>
            )}
          </form.Field>
        </TypesetSection>
        <CoverSection collection={query.data} base={base} />
      </div>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onRetry={() => void reloadAndRetry()}
        pending={update.isPending || query.isFetching}
      />
    </DetailPage>
  )
}
