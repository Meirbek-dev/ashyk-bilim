import { useRef, useState } from 'react'

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
 * A grade write of either kind (B-GRD-14, B-GRD-15): `send` writes the body with `If-Match` = the version the input
 * is based on (the one loaded, then each own save's answer; a live refetch must not move it, or a colleague's save is
 * overwritten unseen); a past-tense toast after; a 412 opens the conflict dialog, whose retry reloads the version and
 * sends the same body again.
 */
export function useGradeSave<Body extends { action: GradeAction }>(
  send: (body: Body, version: number) => Promise<{ version: number }>,
  reload: () => Promise<number>,
  version: number,
): GradeSave<Body> {
  const [pending, setPending] = useState<GradeAction | null>(null)
  const base = useRef(version)
  const conflict = useConflict(async (body: Body, current: number) => {
    setPending(body.action)
    try {
      base.current = (await send(body, current)).version
      toast.add({ title: done[body.action]() })
    } finally {
      setPending(null)
    }
  }, reload)
  return { save: body => conflict.save(body, base.current), pending, dialog: conflict.dialog }
}
