import { contentUrl } from '#/shared/lib/content-url'
import { Avatar, AvatarFallback, AvatarImage } from '#/shared/ui/avatar'

export const userInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()

/**
 * A person's photo (public `avatar_key`, see `contentUrl`), else the initials, on the stock Avatar: the
 * profile menu trigger, people in lists. Decorative next to the name.
 */
type UserAvatarProps = {
  name: string
  avatarKey?: string | null | undefined
  /** `profile`: the large one of a profile page. */
  size?: 'default' | 'profile'
}

export function UserAvatar({ name, avatarKey, size = 'default' }: UserAvatarProps) {
  const large = size === 'profile'
  return (
    <Avatar aria-hidden className={large ? 'size-24' : undefined}>
      {avatarKey ? <AvatarImage src={contentUrl(avatarKey)} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className={large ? 'font-heading text-2xl' : undefined}>{userInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
