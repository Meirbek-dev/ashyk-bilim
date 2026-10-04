import type { ErrorComponentProps } from '@tanstack/react-router'

import { ErrorView } from '#/features/platform'
import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'

import { PlayerFrame } from './player-frame'

/** A 403 in place (not enrolled, course staff, no access) with the way to the course page; other errors as usual. */
export function PlayerError(props: ErrorComponentProps) {
  if (props.error instanceof ApiError && props.error.status === 403)
    return (
      <PlayerFrame title={m.platform_forbidden_title()}>
        <h1 className="text-2xl font-semibold">{m.platform_forbidden_title()}</h1>
        <p className="text-muted-foreground">{m.player_forbidden_text()}</p>
      </PlayerFrame>
    )
  return (
    <PlayerFrame title={m.platform_error_title()}>
      <ErrorView {...props} />
    </PlayerFrame>
  )
}
