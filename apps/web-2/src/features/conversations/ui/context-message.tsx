import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { Message, Person } from '#/shared/api/gen/types.gen'
import { formatDateTime } from '#/shared/i18n/format'
import { personName } from '../model/feed'

export function ContextMessage({
  message,
  people,
  reported,
}: {
  message: Message
  people: Person[]
  reported: boolean
}) {
  const author = people.find(person => person.id === message.user_id)
  return (
    <li className={`flex flex-col gap-1 ${reported ? 'border-s-2 border-destructive ps-3' : ''}`}>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-medium">{author ? personName(author) : m.conversations_unavailable_person()}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(message.created_at_unix)}</span>
      </p>
      {message.deleted ? (
        <p className="text-sm text-muted-foreground italic">{m.conversations_deleted()}</p>
      ) : (
        <MarkdownView content={message.body} />
      )}
    </li>
  )
}
