import { m } from '#/paraglide/messages'

import { PlayerFrame } from './player-frame'

/** An activity that is not in this course's outline (or a course the caller cannot see). */
export function PlayerNotFound() {
  return <PlayerFrame title={m.player_not_found()} text={m.player_not_found_text()} />
}
