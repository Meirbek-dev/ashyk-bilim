import { useHotkey } from '@tanstack/react-hotkeys'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { shortcuts } from '#/features/catalog'
import { CommandPalette } from '#/features/catalog/route'
import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { formatDateTime } from '#/shared/i18n/format'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { toast } from '#/shared/ui/toast'

import { activityKind, locate, staffPreview } from '../model/player'
import { learnerStateOptions, markOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { Contents } from './contents'
import { EntryCard } from './entry-card'
import { LessonContent } from './lesson-content'
import { NeighbourLinks } from './neighbour-links'
import { PlayerAction } from './player-action'
import { PlayerNotFound } from './player-not-found'
import { UnlistedLesson } from './unlisted-lesson'

/**
 * The activity player (spec 5.4): contents left (a sheet when narrow), the activity, its one action and the
 * neighbours. The right panel (`aside`) is the AI panel the route mounts (slice 6.3). `?` (the palette's help)
 * lists the player's shortcuts with the rest.
 */
export function PlayerPage({ aside }: { aside?: { label: string; content: ReactNode } }) {
  const { courseId, activityId } = useParams({ from: '/_authed/learn/$courseId/$activityId' })
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  const [contentsOpen, setContentsOpen] = useState(false)
  const mark = useMutation(markOptions(useQueryClient(), courseId))
  useHotkey(shortcuts.contents.hotkey, () => setContentsOpen(open => !open))
  const found = locate(state, activityId)
  // Not in the outline: unpublished (staff preview it from its own read), or unpublished while open.
  if (!found)
    return staffPreview(state) ? (
      <UnlistedLesson courseId={courseId} activityId={activityId} title={state.title} aside={aside} />
    ) : (
      <PlayerNotFound />
    )
  const { entry, prev, next } = found
  const meta = activityTypeMeta[entry.activity_type]
  const Icon = meta.icon
  const lesson = activityKind(entry.activity_type) === 'lesson'
  const action = <PlayerAction key={entry.id} state={state} entry={entry} />
  // A hosted video watched to the end marks its lesson done, as on the old web (B-PLY-06).
  const videoEnded = () => {
    if (entry.complete || mark.isPending) return
    mark.mutate({ path: { activity_id: entry.id } }, { onSuccess: () => toast.add({ title: m.player_marked() }) })
  }
  return (
    <FocusPage
      back={<BackToCourse courseId={courseId} />}
      title={state.title}
      actions={<CommandPalette />}
      contents={<Contents state={state} onPick={() => setContentsOpen(false)} />}
      contentsSheet={{ open: contentsOpen, onOpenChange: setContentsOpen }}
      aside={aside}
    >
      <article className="flex flex-col gap-gutter">
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon aria-hidden className={`size-4 ${meta.ink}`} />
            {meta.label()}
          </p>
          <h1 className="text-2xl font-semibold wrap-anywhere">{entry.title}</h1>
        </header>
        {entry.blocked_reason ? (
          <p className="text-muted-foreground">
            {entry.opens_at_unix
              ? m.player_opens_at({ date: formatDateTime(entry.opens_at_unix) })
              : m.player_locked_text()}
          </p>
        ) : lesson ? (
          <LessonContent key={entry.id} activityId={entry.id} onVideoEnded={videoEnded} />
        ) : (
          <EntryCard entry={entry} action={action} />
        )}
        <footer className="flex flex-col gap-4 border-t pt-4">
          {lesson ? action : null}
          <NeighbourLinks courseId={courseId} prev={prev} next={next} />
        </footer>
      </article>
    </FocusPage>
  )
}
