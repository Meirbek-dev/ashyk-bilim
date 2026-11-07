import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Collection, UpdateCollectionRequest } from '#/shared/api/gen/types.gen'
import { vUpdateCollectionRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { toast } from '#/shared/ui/toast'

import { hiddenFromOthers, isStale } from '../model/collections'
import { collectionOptions, updateCollectionOptions } from '../queries'

/** «Сохранено», with a warning when nobody else will see the collection (B-COL-16). */
const savedToast = (saved: Collection) =>
  hiddenFromOthers(saved)
    ? { title: m.collections_saved(), description: m.collections_hidden_warning(), type: 'warning' }
    : { title: m.collections_saved() }

/** The edit form of a collection with its save: `If-Match: version`, and a 412 raises `conflict`. */
export function useCollectionEdit(collectionId: string) {
  const query = useSuspenseQuery(collectionOptions(collectionId))
  const navigate = useNavigate()
  const update = useMutation(updateCollectionOptions(useQueryClient(), collectionId))
  const [conflict, setConflict] = useState(false)
  // The base version: a live refresh (`collection.updated`) must not move it, or a save would silently overwrite the
  // change (B-COL-10). Only "reload and retry" takes the newer one, then saves through the form (its leave guard).
  const base = useRef(query.data.version)
  // Captured once: a reload after a conflict must not reset what the user typed.
  const [defaultValues] = useState<UpdateCollectionRequest>(() => ({
    name: query.data.name,
    description: query.data.description,
    public: query.data.public,
    courses: query.data.courses.map(course => course.id),
  }))
  const callbacks = {
    onSuccess: async (saved: Collection) => {
      setConflict(false)
      toast.add(savedToast(saved))
      await navigate({ to: '/collections/$collectionId', params: { collectionId } })
    },
    onError: (error: unknown) => setConflict(isStale(error)),
  }
  const form = useAppForm(vUpdateCollectionRequest, {
    leaveGuard: true,
    defaultValues,
    onSubmit: body =>
      update.mutateAsync(
        { path: { collection_id: collectionId }, body, headers: { 'If-Match': base.current } },
        callbacks,
      ),
  })
  const reloadAndRetry = async () => {
    base.current = (await query.refetch()).data?.version ?? base.current
    await form.handleSubmit()
  }
  return { query, update, form, base, conflict, setConflict, reloadAndRetry }
}
