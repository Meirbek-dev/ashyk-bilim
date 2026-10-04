import { m } from '#/paraglide/messages'

import { PlayerFrame } from './player-frame'

/** An activity that is not in this course's outline (or a course the caller cannot see). */
export function PlayerNotFound() {
  return (
    <PlayerFrame title={m.player_not_found()}>
      <h1 className="text-2xl font-semibold">{m.player_not_found()}</h1>
    </PlayerFrame>
  )
}
