import { Avatar, AvatarFallback } from '#/shared/ui/avatar'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()

/** A person's initials on the stock Avatar: the profile menu trigger, people in lists. Decorative next to the name. */
export function UserAvatar({ name }: { name: string }) {
  return (
    <Avatar aria-hidden>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
