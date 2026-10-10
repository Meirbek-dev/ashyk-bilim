import { Avatar, AvatarFallback, AvatarImage } from '#/shared/ui/avatar'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()

/**
 * A person's photo (public `avatar_key`, served at /content/<key>), else the initials, on the stock Avatar: the
 * profile menu trigger, people in lists. Decorative next to the name.
 */
export function UserAvatar({ name, avatarKey }: { name: string; avatarKey?: string | null | undefined }) {
  return (
    <Avatar aria-hidden>
      {avatarKey ? <AvatarImage src={`/content/${avatarKey}`} alt="" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
