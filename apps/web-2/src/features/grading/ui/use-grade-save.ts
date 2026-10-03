import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { GradeAction } from '#/shared/api/gen/types.gen'
import { toast } from '#/shared/ui/toast'

import { useConflict } from './use-conflict'

const done = {
  save: m.grading_saved,
  publish: m.grading_published,
  return: m.grading_returned,
} satisfies Record<GradeAction, () => string>

type GradeSave<Body> = {
  save: (body: Body) => Promise<void>
  pending: GradeAction | null
  dialog: ReturnType<typeof useConflict>['dialog']
}

/**
 * A grade write of either kind (B-GRD-14, B-GRD-15): `send` writes the body with `If-Match: version` (the mutation
 * puts the answer into the cache); a past-tense toast after; a 412 opens the conflict dialog, whose retry reloads
 * the version and sends the same body again.
 */
export function useGradeSave<Body extends { action: GradeAction }>(
  send: (body: Body, version: number) => Promise<unknown>,
  reload: () => Promise<number>,
  version: number,
): GradeSave<Body> {
  const [pending, setPending] = useState<GradeAction | null>(null)
  const conflict = useConflict(async (body: Body, current: number) => {
    setPending(body.action)
    try {
      await send(body, current)
      toast.add({ title: done[body.action]() })
    } finally {
      setPending(null)
    }
  }, reload)
  return { save: body => conflict.save(body, version), pending, dialog: conflict.dialog }
}
