import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Discussion } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { dislikeOptions, likeOptions } from '../queries'

/** Like and dislike toggles; the counts and the pressed state are the server's answer. */
export function PostReactions({ item }: { item: Discussion }) {
  const queryClient = useQueryClient()
  const like = useMutation(likeOptions(queryClient, item))
  const dislike = useMutation(dislikeOptions(queryClient, item))
  const path = { discussion_id: item.id }
  const error = like.error ?? dislike.error
  return (
    <>
      <Button
        variant="ghost"
        aria-label={m.discussions_like()}
        aria-pressed={item.is_liked}

        onClick={() => like.mutate({ path })}
        disabled={like.isPending}
      >
        {like.isPending ? <Spinner data-icon="inline-start" /> : null}
        <ThumbsUp aria-hidden />
        <span className="tabular-nums">{item.likes_count}</span>
      </Button>
      <Button
        variant="ghost"
        aria-label={m.discussions_dislike()}
        aria-pressed={item.is_disliked}

        onClick={() => dislike.mutate({ path })}
        disabled={dislike.isPending}
      >
        {dislike.isPending ? <Spinner data-icon="inline-start" /> : null}
        <ThumbsDown aria-hidden />
        <span className="tabular-nums">{item.dislikes_count}</span>
      </Button>
      {error ? <p className="w-full text-sm text-destructive">{presentError(error)}</p> : null}
    </>
  )
}
