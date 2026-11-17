import { useHotkey } from '@tanstack/react-hotkeys'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { shortcuts } from '#/features/catalog'
import { CommandPalette } from '#/features/catalog/route'
import { m } from '#/paraglide/messages'
import { EmptyState } from '#/shared/components/empty-state'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatDateTime } from '#/shared/i18n/format'
import { toast } from '#/shared/ui/toast'

import { activityKind, courseArchived, locate, openView, playerAction, staffPreview } from '../model/player'
import { learnerStateOptions, markOptions } from '../queries'
import { ActivityHeader } from './activity-header'
import { ArchivedNote } from './archived-note'
import { BackToCourse } from './back-to-course'
import { Contents } from './contents'
import { EntryCard } from './entry-card'
import { LessonContent } from './lesson-content'
import { NeighbourLinks } from './neighbour-links'
import { OpenViewNote } from './open-view-note'
import { PlayerAction } from './player-action'
import { PlayerNotFound } from './player-not-found'
import { PreviewNote } from './preview-note'
import { UnlistedLesson } from './unlisted-lesson'

/**
 * The activity player (spec 5.4): contents left (a sheet when narrow), the activity, its one action and the
 * neighbours. The right panel (`aside`) is the AI panel the route mounts (slice 6.3). `?` (the palette's help)
 * lists the player's shortcuts with the rest.
 */
export function PlayerPage({ aside }: { aside?: { label: string; content: ReactNode } }) {
  const { courseId, activityId } = useParams({ from: '/_open/learn/$courseId/$activityId' })
  const { data: state, dataUpdatedAt } = useSuspenseQuery(learnerStateOptions(courseId))
  const [contentsOpen, setContentsOpen] = useState(false)
  const mark = useMutation(markOptions(useQueryClient(), courseId))
  useHotkey(shortcuts.contents.hotkey, () => {
    // A wide screen shows the contents beside the page: O moves there instead of opening a second copy in a sheet.
    const panel = document.querySelector<HTMLElement>(`nav[aria-label="${m.ui_contents()}"]`)
    if (panel?.offsetParent)
      return (panel.querySelector<HTMLElement>('[aria-current="page"]') ?? panel.querySelector('a'))?.focus()
    setContentsOpen(open => !open)
  })
  const found = locate(state, activityId)
  // Not in the outline: unpublished (staff preview it from its own read), or unpublished while open.
  if (!found)
    return staffPreview(state) ? (
      <UnlistedLesson courseId={courseId} activityId={activityId} title={state.title} aside={aside} />
    ) : (
      <PlayerNotFound />
    )
  const { entry, prev, next } = found
  const lesson = activityKind(entry.kind) === 'lesson'
  const primary = playerAction(state, entry)
  const continuesTo = primary?.kind === 'continue' ? primary.activityId : null
  const open = openView(state)
  const action = <PlayerAction key={entry.id} state={state} entry={entry} />
  // A hosted video watched to the end marks its lesson done, as on the old web (B-PLY-06); not in an open view.
  const videoEnded = () => {
    if (entry.complete || mark.isPending || staffPreview(state) || open) return
    mark.mutate({ path: { activity_id: entry.id } }, { onSuccess: () => toast.add({ title: m.player_marked() }) })
  }
  return (
    <FocusPage
      back={<BackToCourse courseId={courseId} />}
      title={state.title}
      actions={<CommandPalette />}
      contents={
        <Contents state={state} onPick={() => setContentsOpen(false)} nowUnix={Math.floor(dataUpdatedAt / 1000)} />
      }
      contentsSheet={{ open: contentsOpen, onOpenChange: setContentsOpen }}
      aside={aside}
      // A document or a video uses the column's full width (a PDF in 65ch opened at 38 %, B-PLY-10).
      wide={(entry.kind === 'document' || entry.kind === 'video') && !entry.blocked_reason}
    >
      <article className="flex flex-col gap-gutter @3xl:gap-10">
        {/* Staff see the lesson as learners do, without a mark (B-PLY-01); the work pages say it the same way. Both
            notes speak of the screen, so they stand over the activity's heading, not between it and its text. */}
        {lesson && staffPreview(state) ? <PreviewNote lesson /> : null}
        {courseArchived(state) ? <ArchivedNote /> : null}
        {open ? <OpenViewNote courseId={courseId} /> : null}
        <ActivityHeader key={`${entry.id}:header`} type={entry.kind} title={entry.title} />
        {entry.blocked_reason ? (
          <EmptyState>
            {entry.opens_at_unix
              ? m.player_opens_at({ date: formatDateTime(entry.opens_at_unix) })
              : m.player_locked_text()}
          </EmptyState>
        ) : lesson ? (
          <LessonContent key={entry.id} activityId={entry.id} onVideoEnded={videoEnded} />
        ) : (
          <EntryCard
            courseId={courseId}
            entry={entry}
            action={action}
            nowUnix={Math.floor(dataUpdatedAt / 1000)}
            archived={courseArchived(state)}
          />
        )}
        {/* A lesson's text ends at a hairline; a work entry is a card, its own edge is enough. */}
        <footer className={`flex flex-col gap-gutter ${lesson ? 'border-t pt-gutter' : ''}`}>
          {lesson ? action : null}
          <NeighbourLinks courseId={courseId} prev={prev} next={next} nextShown={lesson && continuesTo === next?.id} />
        </footer>
      </article>
    </FocusPage>
  )
}
