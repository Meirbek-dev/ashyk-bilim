'use client'

import {
  createDiscussion,
  deleteDiscussion,
  toggleDiscussionDislike,
  toggleDiscussionLike,
  updateDiscussion,
} from '@services/courses/discussions'
import type { Discussion } from '@services/courses/discussions'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DiscussionPost from './discussion-post'
import DiscussionForm from './discussion-form'
import { Badge } from '@/components/ui/badge'
import { MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/hooks/useApiError'
import { buildLoginRedirect } from '@/lib/auth/redirect'
import { buttonVariants } from '@/components/ui/button'
import Link from '@components/ui/AppLink'
import type { DiscussionPostData, DiscussionReplyData } from './types'

interface DiscussionListProps {
  initialPosts: Discussion[]
  currentUser: AppUserSummary | null
  courseUuid: string
  onMutate?: () => void
}

/** Fallback author when the server omits `author` (never in v2, kept for the optimistic path). */
function userSummaryToDiscussionUser(user: AppUserSummary): NonNullable<Discussion['user']> {
  const displayName = typeof user.display_name === 'string' ? user.display_name : ''
  return {
    id: user.id ?? '',
    user_uuid: user.id ?? '',
    username: user.username || '',
    first_name: user.first_name || displayName,
    last_name: user.last_name || '',
    email: user.email || '',
    avatar_image: user.avatar_image || '',
  }
}

const toReplyData = (reply: Discussion, anonymousLabel: string): DiscussionReplyData => ({
  id: reply.id,
  discussion_uuid: reply.discussion_uuid,
  username: reply.user?.username || anonymousLabel,
  firstName: reply.user?.first_name || '',
  lastName: reply.user?.last_name || '',
  replyMessage: reply.content,
  createDate: reply.creation_date,
  updateDate: reply.update_date,
  upvotes: reply.likes_count,
  downvotes: reply.dislikes_count,
  userVote: reply.is_liked ? 'up' : reply.is_disliked ? 'down' : null,
  is_liked: reply.is_liked,
  is_disliked: reply.is_disliked,
  can_update: reply.can_update,
  can_delete: reply.can_delete,
  is_owner: reply.is_owner,
})

// Helper to transform API response to UI format
const transformDiscussionToPost = (discussion: Discussion, anonymousLabel: string): DiscussionPostData => ({
  can_update: discussion.can_update,
  can_delete: discussion.can_delete,
  can_moderate: discussion.can_moderate,
  is_owner: discussion.is_owner,
  id: discussion.id,
  discussion_uuid: discussion.discussion_uuid,
  username: discussion.user?.username || anonymousLabel,
  firstName: discussion.user?.first_name || '',
  lastName: discussion.user?.last_name || '',
  postMessage: discussion.content,
  createDate: discussion.creation_date,
  updateDate: discussion.update_date,
  upvotes: discussion.likes_count,
  downvotes: discussion.dislikes_count,
  userVote: discussion.is_liked ? 'up' : discussion.is_disliked ? 'down' : null,
  is_liked: discussion.is_liked,
  is_disliked: discussion.is_disliked,
  replies: (discussion.replies ?? []).map(reply => toReplyData(reply, anonymousLabel)),
})

export default function DiscussionList({ initialPosts, currentUser, courseUuid, onMutate }: DiscussionListProps) {
  const t = useTranslations('CoursePage')
  const { toastApiError } = useApiError()
  const anonymousLabel = t('anonymous')
  const discussionUser = currentUser ?? {}
  // Use lazy initialization to transform initial posts
  const [posts, setPosts] = useState<DiscussionPostData[]>(() => {
    if (Array.isArray(initialPosts)) {
      return initialPosts.map(discussion => transformDiscussionToPost(discussion, anonymousLabel))
    }
    return []
  })
  const postsRafRef = useRef<number | null>(null)
  // Delete confirmation: one dialog for posts and replies.
  const [pendingDelete, setPendingDelete] = useState<{ postId: string; replyId?: string } | null>(null)

  // Update posts when initialPosts changes
  useEffect(() => {
    if (Array.isArray(initialPosts)) {
      const transformedPosts = initialPosts.map(discussion => transformDiscussionToPost(discussion, anonymousLabel))
      // Schedule update on next animation frame to avoid synchronous update in render
      if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current)
      postsRafRef.current = requestAnimationFrame(() => setPosts(transformedPosts))
      return () => {
        if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current)
      }
    } else {
      if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current)
      postsRafRef.current = requestAnimationFrame(() => setPosts([]))
      return () => {
        if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current)
      }
    }
  }, [anonymousLabel, initialPosts])

  const handleSubmitDiscussion = async (content: string) => {
    try {
      const newDiscussion = await createDiscussion(courseUuid, {
        content,
        type: 'post',
      })

      // If the new discussion doesn't have user data, populate it with current user
      if (!newDiscussion.user && currentUser) {
        newDiscussion.user = userSummaryToDiscussionUser(currentUser)
      }

      // Transform API response to match UI expectations
      const newPost = transformDiscussionToPost(newDiscussion, anonymousLabel)

      setPosts([newPost, ...posts])
      toast.success(t('toasts.posted'))

      // Refresh data from server
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.createFailed') })
    }
  }

  const handleSubmitReply = async (postId: string, replyContent: string) => {
    // Find the parent post to get its ID
    const parentPost = posts.find(post => post.id === postId)
    if (!parentPost) {
      console.error('Parent post not found:', postId)
      return
    }

    try {
      const newReply = await createDiscussion(courseUuid, {
        content: replyContent,
        type: 'reply',
        parent_discussion_id: parentPost.id,
      })

      // If the new reply doesn't have user data, populate it with current user
      if (!newReply.user && currentUser) {
        newReply.user = userSummaryToDiscussionUser(currentUser)
      }

      const transformedReply = toReplyData(newReply, anonymousLabel)

      // Update local state with the new reply
      setPosts(
        posts.map(post =>
          post.id === postId ? { ...post, replies: [...(post.replies || []), transformedReply] } : post,
        ),
      )

      toast.success(t('toasts.replied'))

      // Refresh data from server to ensure consistency
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.replyFailed') })
    }
  }

  const handleVotePost = async (postId: string, voteType: 'up' | 'down') => {
    const post = posts.find(p => p.id === postId)
    if (!post) return

    try {
      let response

      if (voteType === 'up') {
        response = await toggleDiscussionLike(courseUuid, post.discussion_uuid)
      } else {
        response = await toggleDiscussionDislike(courseUuid, post.discussion_uuid)
      }

      // Update UI based on API response
      setPosts(
        posts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              upvotes: response.likes_count,
              downvotes: response.dislikes_count,
              userVote: response.is_liked ? 'up' : response.is_disliked ? 'down' : null,
              is_liked: response.is_liked,
              is_disliked: response.is_disliked,
            }
          }
          return p
        }),
      )

      // Refresh discussions data if available
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.voteFailed') })
    }
  }

  const handleVoteReply = async (postId: string, replyId: string, voteType: 'up' | 'down') => {
    const post = posts.find(p => p.id === postId)
    if (!post) {
      console.error('Post not found:', postId)
      return
    }

    const reply = post.replies?.find((r: DiscussionReplyData) => r.id === replyId)
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId)
      return
    }

    try {
      let response

      if (voteType === 'up') {
        response = await toggleDiscussionLike(courseUuid, reply.discussion_uuid)
      } else {
        response = await toggleDiscussionDislike(courseUuid, reply.discussion_uuid)
      }

      // Update UI based on API response
      setPosts(
        posts.map(currentPost => {
          if (currentPost.id === postId) {
            return {
              ...currentPost,
              replies: currentPost.replies?.map((r: DiscussionReplyData) => {
                if (r.id === replyId) {
                  return {
                    ...r,
                    upvotes: response.likes_count,
                    downvotes: response.dislikes_count,
                    userVote: response.is_liked ? 'up' : response.is_disliked ? 'down' : null,
                    is_liked: response.is_liked,
                    is_disliked: response.is_disliked,
                  }
                }
                return r
              }),
            }
          }
          return currentPost
        }),
      )

      // Refresh discussions data if available
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.voteFailed') })
    }
  }

  const handleDeletePost = async (postId: string) => {
    const post = posts.find(p => p.id === postId)
    if (!post) return

    try {
      await deleteDiscussion(courseUuid, post.discussion_uuid)
      setPosts(posts.filter(currentPost => currentPost.id !== postId))
      toast.success(t('toasts.deleted'))

      // Refresh data from server
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.deleteFailed') })
    }
  }

  const handleDeleteReply = async (postId: string, replyId: string) => {
    const post = posts.find(p => p.id === postId)
    if (!post) {
      console.error('Post not found:', postId)
      return
    }

    const reply = post.replies?.find((r: DiscussionReplyData) => r.id === replyId)
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId)
      return
    }

    try {
      await deleteDiscussion(courseUuid, reply.discussion_uuid)

      // Update local state
      setPosts(
        posts.map(currentPost =>
          currentPost.id === postId
            ? {
                ...currentPost,
                replies: currentPost.replies?.filter(
                  (currentReply: DiscussionReplyData) => currentReply.id !== replyId,
                ),
              }
            : currentPost,
        ),
      )
      toast.success(t('toasts.deleted'))

      // Refresh data from server
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.deleteFailed') })
    }
  }

  const handleEditPost = async (postId: string, newMessage: string) => {
    const post = posts.find(p => p.id === postId)
    if (!post) return

    try {
      await updateDiscussion(courseUuid, post.discussion_uuid, {
        content: newMessage,
      })
      setPosts(
        posts.map(currentPost =>
          currentPost.id === postId
            ? {
                ...currentPost,
                postMessage: newMessage,
                updateDate: new Date().toISOString(),
              }
            : currentPost,
        ),
      )
      toast.success(t('toasts.edited'))

      // Refresh data from server
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.updateFailed') })
    }
  }

  const handleEditReply = async (postId: string, replyId: string, newMessage: string) => {
    const post = posts.find(p => p.id === postId)
    if (!post) {
      console.error('Post not found:', postId)
      return
    }

    const reply = post.replies?.find((r: DiscussionReplyData) => r.id === replyId)
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId)
      return
    }

    try {
      const updatedReply = await updateDiscussion(courseUuid, reply.discussion_uuid, {
        content: newMessage,
      })

      // Update local state with the updated reply data from server
      setPosts(
        posts.map(currentPost =>
          currentPost.id === postId
            ? {
                ...currentPost,
                replies: currentPost.replies?.map((currentReply: DiscussionReplyData) =>
                  currentReply.id === replyId
                    ? {
                        ...currentReply,
                        replyMessage: updatedReply.content,
                        updateDate: updatedReply.update_date || new Date().toISOString(),
                      }
                    : currentReply,
                ),
              }
            : currentPost,
        ),
      )
      toast.success(t('toasts.edited'))

      // Refresh data from server
      if (onMutate) {
        onMutate()
      }
    } catch (error) {
      toastApiError(error, { fallback: t('errors.updateFailed') })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold">{t('courseDiscussions')}</h2>
        <Badge variant="secondary" className="rounded-full px-2.5">
          {posts.length}
        </Badge>
      </div>

      {currentUser ? (
        <DiscussionForm currentUser={discussionUser} onSubmit={handleSubmitDiscussion} />
      ) : (
        // UX-109: posting needs a session — a sign-in prompt instead of a
        // form whose «Опубликовать» ends in a 401 and loses the text.
        <Card>
          <CardContent className="p-6">
            <Link href={buildLoginRedirect(`/course/${courseUuid}`)} className={buttonVariants({ variant: 'outline' })}>
              {t('signInToParticipate')}
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {posts.map(post => (
          <DiscussionPost
            key={post.id}
            post={post}
            currentUser={discussionUser}
            onVotePost={handleVotePost}
            onVoteReply={handleVoteReply}
            onDeletePost={postId => setPendingDelete({ postId })}
            onDeleteReply={(postId, replyId) => setPendingDelete({ postId, replyId })}
            onEditPost={handleEditPost}
            onEditReply={handleEditReply}
            onSubmitReply={handleSubmitReply}
          />
        ))}

        {posts.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageCircle size={48} className="mx-auto mb-4 text-neutral-300" />
              <h3 className="mb-2 text-lg font-semibold text-neutral-600">{t('noDiscussions')}</h3>
              <p className="mb-4 text-neutral-500">{t('noDiscussionsDesc')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={open => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.replyId ? t('confirmDeleteReply') : t('confirmDeletePost')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return
                const { postId, replyId } = pendingDelete
                setPendingDelete(null)
                void (replyId ? handleDeleteReply(postId, replyId) : handleDeletePost(postId))
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
