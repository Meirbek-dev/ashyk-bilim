'use client';

import {
  createDiscussion,
  deleteDiscussion,
  toggleDiscussionDislike,
  toggleDiscussionLike,
  updateDiscussion,
} from '@services/courses/discussions';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect, useRef, useState } from 'react';
import DiscussionPost from './discussion-post';
import DiscussionForm from './discussion-form';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DiscussionListProps {
  initialPosts: any[];
  currentUser: any;
  courseUuid: string;
  onMutate?: () => void; // Function to refresh discussions data
}

// Helper function to transform API response to UI format
const transformDiscussionToPost = (discussion: any) => {
  // Handle date formatting properly
  const formatDate = (dateStr: string) => {
    if (!dateStr) return new Date().toISOString();
    // If it's already a valid ISO string, return it
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      return dateStr;
    }
    // If it's a timestamp string, parse it
    try {
      const date = new Date(dateStr);
      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  return {
    id: discussion.id?.toString() || '',
    discussion_uuid: discussion.discussion_uuid || '',
    username: discussion.user?.username || 'Anonymous',
    firstName: discussion.user?.first_name || '',
    lastName: discussion.user?.last_name || '',
    postMessage: discussion.content || '',
    createDate: formatDate(discussion.creation_date),
    updateDate: formatDate(discussion.update_date),
    upvotes: Number.parseInt(discussion.likes_count, 10) || 0,
    downvotes: Number.parseInt(discussion.dislikes_count, 10) || 0,
    userVote: discussion.is_liked ? 'up' : discussion.is_disliked ? 'down' : null,
    is_liked: discussion.is_liked,
    is_disliked: discussion.is_disliked,
    replies:
      discussion.replies?.map((reply: any) => ({
        id: reply.id?.toString() || '',
        discussion_uuid: reply.discussion_uuid || '',
        username: reply.user?.username || 'Anonymous',
        firstName: reply.user?.first_name || '',
        lastName: reply.user?.last_name || '',
        replyMessage: reply.content || '',
        createDate: formatDate(reply.creation_date),
        updateDate: formatDate(reply.update_date),
        upvotes: Number.parseInt(reply.likes_count, 10) || 0,
        downvotes: Number.parseInt(reply.dislikes_count, 10) || 0,
        userVote: reply.is_liked ? 'up' : reply.is_disliked ? 'down' : null,
        is_liked: reply.is_liked,
        is_disliked: reply.is_disliked,
      })) || [],
  };
};

export default function DiscussionList({ initialPosts, currentUser, courseUuid, onMutate }: DiscussionListProps) {
  const t = useTranslations('CoursePage');
  // Use lazy initialization to transform initial posts
  const [posts, setPosts] = useState<any[]>(() => {
    if (Array.isArray(initialPosts)) {
      return initialPosts.map(transformDiscussionToPost);
    }
    return [];
  });
  const postsRafRef = useRef<number | null>(null);

  // Update posts when initialPosts changes
  useEffect(() => {
    if (Array.isArray(initialPosts)) {
      const transformedPosts = initialPosts.map(transformDiscussionToPost);
      // Schedule update on next animation frame to avoid synchronous update in render
      if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current);
      postsRafRef.current = requestAnimationFrame(() => setPosts(transformedPosts));
      return () => {
        if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current);
      };
    } else {
      if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current);
      postsRafRef.current = requestAnimationFrame(() => setPosts([]));
      return () => {
        if (postsRafRef.current) cancelAnimationFrame(postsRafRef.current);
      };
    }
  }, [initialPosts]);

  const handleSubmitDiscussion = async (content: string) => {
    try {
      const newDiscussion = await createDiscussion(courseUuid, {
        content,
        type: 'post',
      });

      // If the new discussion doesn't have user data, populate it with current user
      if (!newDiscussion.user && currentUser) {
        newDiscussion.user = {
          id: currentUser.id,
          user_uuid: currentUser.user_uuid || '',
          username: currentUser.username,
          first_name: currentUser.first_name || '',
          last_name: currentUser.last_name || '',
          email: currentUser.email || '',
          avatar_image: currentUser.avatar_image || '',
          bio: currentUser.bio || '',
          details: currentUser.details || {},
          profile: currentUser.profile || {},
        };
      }

      // Transform API response to match UI expectations
      const newPost = transformDiscussionToPost(newDiscussion);

      setPosts([newPost, ...posts]);

      // Refresh data from server
      if (onMutate) {
        onMutate();
      }
    } catch (error: any) {
      console.error('Failed to create discussion:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        stack: error.stack,
      });
    }
  };

  const handleSubmitReply = async (postId: string, replyContent: string) => {
    // Find the parent post to get its ID
    const parentPost = posts.find((post) => post.id === postId);
    if (!parentPost) {
      console.error('Parent post not found:', postId);
      return;
    }

    try {
      const newReply = await createDiscussion(courseUuid, {
        content: replyContent,
        type: 'reply',
        parent_discussion_id: Number.parseInt(parentPost.id, 10),
      });

      // If the new reply doesn't have user data, populate it with current user
      if (!newReply.user && currentUser) {
        newReply.user = {
          id: currentUser.id,
          user_uuid: currentUser.user_uuid || '',
          username: currentUser.username,
          first_name: currentUser.first_name || '',
          last_name: currentUser.last_name || '',
          email: currentUser.email || '',
          avatar_image: currentUser.avatar_image || '',
          bio: currentUser.bio || '',
          details: currentUser.details || {},
          profile: currentUser.profile || {},
        };
      }

      // Transform the reply to match UI expectations
      const transformedReply = {
        id: newReply.id?.toString() || '',
        discussion_uuid: newReply.discussion_uuid || '',
        username: newReply.user?.username || 'Anonymous',
        firstName: newReply.user?.first_name || '',
        lastName: newReply.user?.last_name || '',
        replyMessage: newReply.content || '',
        createDate: newReply.creation_date || new Date().toISOString(),
        updateDate: newReply.update_date || new Date().toISOString(),
        upvotes: Number.parseInt(newReply.likes_count.toString(), 10) || 0,
        downvotes: 0,
        userVote: null,
      };

      // Update local state with the new reply
      setPosts(
        posts.map((post) =>
          post.id === postId ? { ...post, replies: [...(post.replies || []), transformedReply] } : post,
        ),
      );

      // Refresh data from server to ensure consistency
      if (onMutate) {
        onMutate();
      }
    } catch (error: any) {
      console.error('Failed to create reply:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.status,
        stack: error.stack,
      });
    }
  };

  const handleVotePost = async (postId: string, voteType: 'up' | 'down') => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      let response;

      if (voteType === 'up') {
        response = await toggleDiscussionLike(courseUuid, post.discussion_uuid);
      } else {
        response = await toggleDiscussionDislike(courseUuid, post.discussion_uuid);
      }

      // Update UI based on API response
      setPosts(
        posts.map((p) => {
          if (p.id === postId) {
            return {
              ...p,
              upvotes: response.likes_count,
              downvotes: response.dislikes_count,
              userVote: response.is_liked ? 'up' : response.is_disliked ? 'down' : null,
              is_liked: response.is_liked,
              is_disliked: response.is_disliked,
            };
          }
          return p;
        }),
      );

      // Refresh discussions data if available
      if (onMutate) {
        onMutate();
      }
    } catch (error: any) {
      console.error('Failed to toggle vote on post:', error);
      // You could show a toast notification here
    }
  };

  const handleVoteReply = async (postId: string, replyId: string, voteType: 'up' | 'down') => {
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      console.error('Post not found:', postId);
      return;
    }

    const reply = post.replies?.find((r: any) => r.id === replyId);
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId);
      return;
    }

    try {
      let response;

      if (voteType === 'up') {
        response = await toggleDiscussionLike(courseUuid, reply.discussion_uuid);
      } else {
        response = await toggleDiscussionDislike(courseUuid, reply.discussion_uuid);
      }

      // Update UI based on API response
      setPosts(
        posts.map((post) => {
          if (post.id === postId) {
            return {
              ...post,
              replies: post.replies?.map((r: any) => {
                if (r.id === replyId) {
                  return {
                    ...r,
                    upvotes: response.likes_count,
                    downvotes: response.dislikes_count,
                    userVote: response.is_liked ? 'up' : response.is_disliked ? 'down' : null,
                    is_liked: response.is_liked,
                    is_disliked: response.is_disliked,
                  };
                }
                return r;
              }),
            };
          }
          return post;
        }),
      );

      // Refresh discussions data if available
      if (onMutate) {
        onMutate();
      }
    } catch (error) {
      console.error('Failed to vote on reply:', error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      await deleteDiscussion(courseUuid, post.discussion_uuid);
      setPosts(posts.filter((post) => post.id !== postId));

      // Refresh data from server
      if (onMutate) {
        onMutate();
      }
    } catch (error) {
      console.error('Failed to delete discussion:', error);
    }
  };

  const handleDeleteReply = async (postId: string, replyId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      console.error('Post not found:', postId);
      return;
    }

    const reply = post.replies?.find((r: any) => r.id === replyId);
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId);
      return;
    }

    try {
      await deleteDiscussion(courseUuid, reply.discussion_uuid);

      // Update local state
      setPosts(
        posts.map((post) =>
          post.id === postId ? { ...post, replies: post.replies?.filter((reply: any) => reply.id !== replyId) } : post,
        ),
      );

      // Refresh data from server
      if (onMutate) {
        onMutate();
      }
    } catch (error) {
      console.error('Failed to delete reply:', error);
    }
  };

  const handleEditPost = async (postId: string, newMessage: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      await updateDiscussion(courseUuid, post.discussion_uuid, { content: newMessage });
      setPosts(
        posts.map((post) =>
          post.id === postId ? { ...post, postMessage: newMessage, updateDate: new Date().toISOString() } : post,
        ),
      );

      // Refresh data from server
      if (onMutate) {
        onMutate();
      }
    } catch (error) {
      console.error('Failed to update discussion:', error);
    }
  };

  const handleEditReply = async (postId: string, replyId: string, newMessage: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) {
      console.error('Post not found:', postId);
      return;
    }

    const reply = post.replies?.find((r: any) => r.id === replyId);
    if (!reply?.discussion_uuid) {
      console.error('Reply not found or missing discussion_uuid:', replyId);
      return;
    }

    try {
      const updatedReply = await updateDiscussion(courseUuid, reply.discussion_uuid, { content: newMessage });

      // Update local state with the updated reply data from server
      setPosts(
        posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                replies: post.replies?.map((reply: any) =>
                  reply.id === replyId
                    ? {
                        ...reply,
                        replyMessage: updatedReply.content,
                        updateDate: updatedReply.update_date || new Date().toISOString(),
                      }
                    : reply,
                ),
              }
            : post,
        ),
      );

      // Refresh data from server
      if (onMutate) {
        onMutate();
      }
    } catch (error) {
      console.error('Failed to update reply:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold">{t('courseDiscussions')}</h2>
        <Badge
          variant="secondary"
          className="rounded-full px-2.5"
        >
          {posts.length}
        </Badge>
      </div>

      <DiscussionForm
        currentUser={currentUser}
        onSubmit={handleSubmitDiscussion}
      />

      <div className="space-y-4">
        {posts.map((post) => (
          <DiscussionPost
            key={post.id}
            post={post}
            currentUser={currentUser}
            onVotePost={handleVotePost}
            onVoteReply={handleVoteReply}
            onDeletePost={handleDeletePost}
            onDeleteReply={handleDeleteReply}
            onEditPost={handleEditPost}
            onEditReply={handleEditReply}
            onSubmitReply={handleSubmitReply}
          />
        ))}

        {posts.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageCircle
                size={48}
                className="mx-auto mb-4 text-neutral-300"
              />
              <h3 className="mb-2 text-lg font-semibold text-neutral-600">{t('noDiscussions')}</h3>
              <p className="mb-4 text-neutral-500">{t('noDiscussionsDesc')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
