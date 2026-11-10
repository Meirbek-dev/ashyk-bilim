import { m } from '#/paraglide/messages'
import type { Recipient } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'
import { personName, roleLabels } from '../model/feed'

/** A person to write to, with the course that links them; the row opens the composer with that course as context. */
export function RecipientRow({ recipient }: { recipient: Recipient }) {
  const name = personName(recipient.person)
  return (
    <div className="relative flex items-center gap-3">
      <UserAvatar name={name} avatarKey={recipient.person.avatar_key} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="font-normal wrap-anywhere">
          <Link
            variant="stretched"
            to="/conversations/new"
            search={{ to: recipient.person.id, course: recipient.course_id }}
          >
            {name}
          </Link>
        </h2>
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {m.conversations_recipient_course({ role: roleLabels[recipient.role](), course: recipient.course_name })}
        </p>
      </div>
    </div>
  )
}
