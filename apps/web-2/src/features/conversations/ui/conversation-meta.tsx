import { m } from '#/paraglide/messages'
import type { Person, SharedCourse } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'

/** The line under the person's name: their profile and the course they share with the viewer. */
export function ConversationMeta({ peer, shared }: { peer: Person; shared: SharedCourse | undefined }) {
  return (
    <>
      {peer.available ? (
        <Link to="/users/$username" params={{ username: peer.username }}>
          {m.conversations_profile()}
        </Link>
      ) : null}
      {peer.available && shared ? ' · ' : null}
      {shared ? m.conversations_shared_course({ course: shared.name }) : null}
    </>
  )
}
