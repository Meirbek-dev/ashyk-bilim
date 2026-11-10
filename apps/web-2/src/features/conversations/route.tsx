// Route-level code (validateSearch) and the shell's slot: the route tree and the shell keep it in the entry chunk,
// so this file imports nothing of the feature statically (AGENTS.md "Entry chunk").
import { useHydrated } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import * as v from 'valibot'

const onlyTrue = v.fallback(
  v.optional(
    v.pipe(
      v.boolean(),
      v.transform(only => only || undefined),
    ),
  ),
  undefined,
)
const optionalId = v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined)

/** /conversations?unread=true: only conversations with something unread. */
export const conversationsSearchSchema = v.object({ unread: onlyTrue })

/** /conversations/new?to=&course=&activity=: the recipient (else the picker) and what the message is about. */
export const newConversationSearchSchema = v.object({
  to: optionalId,
  course: optionalId,
  activity: optionalId,
})

/** /conversations/$conversationId?course=&activity=: an entry point's context for the next message sent. */
export const conversationSearchSchema = v.object({ course: optionalId, activity: optionalId })

/** /admin/message-reports?status=resolved&report=<id>: the decided ones; one report opened. */
export const reportsSearchSchema = v.object({
  status: v.fallback(v.optional(v.picklist(['resolved'])), undefined),
  report: optionalId,
})

const Link = lazy(() => import('./ui/messages-link').then(module => ({ default: module.MessagesLink })))

/**
 * The shell's `messages` slot, next to the bell: the link reads its count in the browser, after hydration (no SSR
 * request). Until then its place is kept, so the bell and the profile menu do not jump when it arrives.
 */
export function MessagesSlot() {
  const hydrated = useHydrated()
  const place = <span aria-hidden className="size-8 shrink-0" />
  if (!hydrated) return place
  return (
    <Suspense fallback={place}>
      <Link />
    </Suspense>
  )
}
