import { useHotkey } from '@tanstack/react-hotkeys'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { CommandPalette, shortcuts } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { FocusPage } from '#/shared/ui/templates/focus-page'

import { activityKind, locate } from '../model/player'
import { learnerStateOptions } from '../queries'
import { BackToCourse } from './back-to-course'
import { Contents } from './contents'
import { EntryCard } from './entry-card'
import { LessonContent } from './lesson-content'
import { NeighbourLinks } from './neighbour-links'
import { PlayerAction } from './player-action'
import { PlayerNotFound } from './player-not-found'

/**
 * The activity player (spec 5.4): contents left (a sheet when narrow), the activity, its one action and the
 * neighbours. The right panel is the AI slot of slice 6.3 and stays empty until then. `?` (the palette's help)
 * lists the player's shortcuts with the rest.
 */
export function PlayerPage() {
  const { courseId, activityId } = useParams({ from: '/_authed/learn/$courseId/$activityId' })
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  const [contentsOpen, setContentsOpen] = useState(false)
  useHotkey(shortcuts.contents.hotkey, () => setContentsOpen(open => !open))
  const found = locate(state, activityId)
  // Unpublished while open: the re-read state no longer lists it.
  if (!found) return <PlayerNotFound />
  const { entry, prev, next } = found
  const meta = activityTypeMeta[entry.activity_type]
  const Icon = meta.icon
  const lesson = activityKind(entry.activity_type) === 'lesson'
  const action = <PlayerAction key={entry.id} state={state} entry={entry} />
  return (
    <FocusPage
      back={<BackToCourse courseId={courseId} />}
      title={state.title}
      actions={<CommandPalette />}
      contents={<Contents state={state} onPick={() => setContentsOpen(false)} />}
      contentsSheet={{ open: contentsOpen, onOpenChange: setContentsOpen }}
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
          <p className="text-muted-foreground">{m.player_locked_text()}</p>
        ) : lesson ? (
          <LessonContent key={entry.id} activityId={entry.id} />
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
