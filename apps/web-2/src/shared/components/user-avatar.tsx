import { useState } from 'react'

import { contentPreviews, contentUrl } from '#/shared/lib/content-url'
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
 * profile menu trigger, people in lists. Decorative next to the name. The photo is its WebP preview at the drawn
 * size; the original while the preview is not written yet (a just-uploaded photo, before the job ran).
 */
type UserAvatarProps = {
  name: string
  avatarKey?: string | null | undefined
  /** `profile`: the large one of a profile page. */
  size?: 'default' | 'profile'
}

export function UserAvatar({ name, avatarKey, size = 'default' }: UserAvatarProps) {
  const large = size === 'profile'
  const [noPreview, setNoPreview] = useState<string | null>(null)
  const preview = avatarKey && noPreview !== avatarKey ? contentPreviews(avatarKey, 'avatar') : null
  return (
    <Avatar aria-hidden className={large ? 'size-24' : undefined}>
      {preview ? (
        <AvatarImage
          // A new element for the original: Base UI keeps the failed status of the one it replaces otherwise.
          key="preview"
          src={preview.src}
          srcSet={preview.srcSet}
          // The drawn size (size-8 / size-24): the browser takes the preview that covers it at the screen's density.
          sizes={large ? '96px' : '32px'}
          alt=""
          onLoadingStatusChange={status => {
            if (status === 'error') setNoPreview(avatarKey ?? null)
          }}
        />
      ) : avatarKey ? (
        <AvatarImage key="original" src={contentUrl(avatarKey)} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className={large ? 'font-heading text-2xl' : undefined}>{userInitials(name)}</AvatarFallback>
    </Avatar>
  )
}
