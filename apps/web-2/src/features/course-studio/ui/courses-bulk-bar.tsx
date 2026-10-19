import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { BULK_ACTIONS, type BulkAction, bulkTargets } from '../model/bulk'
import { bulkCoursesOptions } from '../queries'

const verbs: Record<BulkAction, () => string> = {
  publish: m.studio_publish,
  unpublish: m.studio_unpublish,
  archive: m.studio_archive,
  restore: m.studio_restore,
  delete: m.studio_bulk_delete,
}

type BulkBarProps = { selected: readonly Course[]; onDone: () => void }

/**
 * What the selected courses can go through together (B-CST-45): each action counts the courses that allow it, asks
 * first, and reports how many went through.
 */
export function CoursesBulkBar({ selected, onDone }: BulkBarProps) {
  const [action, setAction] = useState<BulkAction | null>(null)
  const bulk = useMutation(bulkCoursesOptions())
  if (selected.length === 0) return null
  const targets = action ? bulkTargets(selected, action) : []
  return (
    // Sticky under the top bar (h-14): a phone scrolls the list while picking, the actions stay in reach.
    <div className="sticky top-14 z-10 -my-2 flex flex-wrap items-center gap-2 bg-background py-2">
      <p className="text-sm tabular-nums">{m.studio_bulk_selected({ count: formatNumber(selected.length) })}</p>
      {BULK_ACTIONS.map(name => {
        const count = bulkTargets(selected, name).length
        return count > 0 ? (
          <Button key={name} variant="outline" onClick={() => setAction(name)}>
            {verbs[name]()} ({formatNumber(count)})
          </Button>
        ) : null
      })}
      <ConfirmDialog
        open={action !== null}
        onOpenChange={open => {
          if (!open) setAction(null)
        }}
        title={action ? m.studio_bulk_confirm({ action: verbs[action](), count: formatNumber(targets.length) }) : ''}
        consequence={action === 'delete' ? m.studio_course_delete_hint() : m.studio_bulk_consequence()}
        confirmLabel={action ? verbs[action]() : ''}
        pending={bulk.isPending}
        error={bulk.error}
        onConfirm={() =>
          action &&
          bulk.mutate(
            { courses: targets, action },
            {
              onSuccess: result => {
                setAction(null)
                toast.add({
                  title: m.studio_bulk_done({ done: formatNumber(result.done), failed: formatNumber(result.failed) }),
                })
                onDone()
              },
            },
          )
        }
      />
    </div>
  )
}
