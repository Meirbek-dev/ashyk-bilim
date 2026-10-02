import { useSuspenseQuery } from '@tanstack/react-query'

import { publicProfileByIdOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { Avatar } from '#/shared/ui/avatar'

/** The public profile card of the user a blockUser points to (every reader, guests too, may load it). */
export function UserCard({ userId }: { userId: string }) {
  const { data } = useSuspenseQuery(publicProfileByIdOptions({ path: { user_id: userId } }))
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <Avatar name={data.display_name || data.username} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{data.display_name || data.username}</p>
        <p className="text-sm text-muted-foreground">@{data.username}</p>
        {data.bio ? <p className="text-sm">{data.bio}</p> : null}
      </div>
    </div>
  )
}
