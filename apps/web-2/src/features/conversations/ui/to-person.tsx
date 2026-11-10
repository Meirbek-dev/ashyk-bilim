import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { denyText, personName } from '../model/feed'
import { peerOptions } from '../queries'
import { Composer } from './composer'

export function ToPerson({
  to,
  course,
  activity,
}: {
  to: string
  course?: string | undefined
  activity?: string | undefined
}) {
  const { data } = useSuspenseQuery(peerOptions(to))
  const navigate = useNavigate()
  const name = personName(data.peer)
  return (
    <div className="flex max-w-2xl flex-col gap-gutter">
      <div className="flex items-center gap-3">
        <UserAvatar name={name} avatarKey={data.peer.avatar_key} />
        <p className="min-w-0 flex-1 font-medium wrap-anywhere">{name}</p>
        <Link to="/conversations/new" search={{}}>
          {m.conversations_change_recipient()}
        </Link>
      </div>
      {data.allowed_actions.includes('send') ? (
        <Composer
          to={to}
          context={{ course, activity }}
          onSent={message =>
            void navigate({
              to: '/conversations/$conversationId',
              params: { conversationId: message.conversation_id },
              replace: true,
            })
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.deny_reason ? denyText[data.deny_reason]() : denyText.no_relation()}
        </p>
      )}
    </div>
  )
}
