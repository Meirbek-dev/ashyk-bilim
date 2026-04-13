'use client';

import { ArrowBigDown, ArrowBigUp, Clock, Edit, Trash2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { Actions, Resources, Scopes } from '@/types/permissions';
import RichContentRenderer from './rich-content-renderer';
import UserAvatar from '@components/Objects/UserAvatar';
import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { hasMeaningfulText } from './text';

const RichTextEditor = dynamic(
  () => import('@components/Objects/Editor/views/DiscussionEditor').then((m) => ({ default: m.DiscussionEditor })),
  {
    ssr: false,
    loading: () => <div className="bg-muted/40 h-[80px] w-full animate-pulse rounded-lg border" />,
  },
);

interface DiscussionReplyProps {
  reply: any;
  postId: string;
  currentUser: any;
  onVoteReply: (postId: string, replyId: string, voteType: 'up' | 'down') => void;
  onDeleteReply: (postId: string, replyId: string) => void;
  onEditReply: (postId: string, replyId: string, newMessage: string) => void;
}

export default function DiscussionReply({
  reply,
  postId,
  currentUser,
  onVoteReply,
  onDeleteReply,
  onEditReply,
}: DiscussionReplyProps) {
  const t = useTranslations('CoursePage');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.replyMessage);
  const [_isPending, startTransition] = useTransition();
  const format = useFormatter();
  const now = useNow();
  const { can } = useSession();
  const canModerateDiscussion = can(Resources.DISCUSSION, Actions.MODERATE, Scopes.PLATFORM);

  const isOwnReply = reply.username === currentUser?.username;
  const netScore = reply.upvotes - reply.downvotes;

  const getUserDisplayName = (firstName?: string, lastName?: string) => {
    const first = firstName || '';
    const last = lastName || '';
    return `${first} ${last}`.trim() || reply.username;
  };

  const handleEditSubmit = (formData: FormData) => {
    const nextEditContent = String(formData.get('editContent') ?? '');

    if (!hasMeaningfulText(nextEditContent)) return;
    startTransition(() => {
      onEditReply(postId, reply.id, nextEditContent);
      setEditing(false);
    });
  };

  // Helper to check if a given user is a platform admin
  const isAuthorAdmin = (username: string) => {
    if (!reply?.username) return false;
    // If current user is admin and is the author, show badge
    return canModerateDiscussion && username === currentUser?.username;
  };

  return (
    <div className="group border-border hover:border-muted-foreground relative ml-6 border-l-2 py-4 pl-6 transition-colors">
      {/* Connection line dot */}
      <div className="bg-border group-hover:bg-foreground absolute top-6 left-[-5px] h-2 w-2 rounded-full transition-colors" />

      <div className="flex gap-3">
        <UserAvatar
          size="sm"
          variant="default"
          username={reply.username}
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-foreground truncate font-medium">
                {getUserDisplayName(reply.firstName, reply.lastName)}
              </span>
              <span className="text-muted-foreground truncate text-sm">@{reply.username}</span>
              {isAuthorAdmin(reply.username) && (
                <Badge
                  variant="destructive"
                  className="h-auto px-1.5 py-0.5 text-xs"
                >
                  {t('admin')}
                </Badge>
              )}
              <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                <Clock size={12} />
                <span>{format.relativeTime(new Date(reply.createDate), now)}</span>
                {reply.updateDate &&
                  reply.createDate &&
                  new Date(reply.updateDate).getTime() !== new Date(reply.createDate).getTime() && (
                    <span className="text-muted-foreground text-xs">({t('edited')})</span>
                  )}
              </div>
            </div>

            {/* Action buttons */}
            {(canModerateDiscussion || isOwnReply) && !editing && (
              <div className="mr-5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {isOwnReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(true);
                      setEditContent(reply.replyMessage);
                    }}
                    className="text-muted-foreground hover:bg-primary/10 hover:text-primary h-7 w-7 p-0"
                  >
                    <Edit size={12} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteReply(postId, reply.id)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 w-7 p-0"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          {editing ? (
            <form
              action={handleEditSubmit}
              className="space-y-3"
            >
              <input
                type="hidden"
                name="editContent"
                value={editContent}
              />
              <RichTextEditor
                content={editContent}
                onChange={setEditContent}
                placeholder={t('editReplyPlaceholder')}
                minHeight="80px"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="h-8 px-3 text-sm"
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!hasMeaningfulText(editContent)}
                  className="h-8 px-3 text-sm"
                >
                  {t('save')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="mb-3">
                <RichContentRenderer
                  content={reply.replyMessage}
                  className="text-muted-foreground text-sm leading-relaxed"
                />
              </div>

              {/* Voting section */}
              <div className="flex items-center gap-3">
                <div className="border-border bg-muted flex items-center overflow-hidden rounded-lg border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVoteReply(postId, reply.id, 'up')}
                    className={cn(
                      'h-8 rounded-none border-border border-r px-3 transition-all',
                      reply.userVote === 'up'
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-emerald-600',
                    )}
                  >
                    <ArrowBigUp
                      size={14}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{reply.upvotes}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVoteReply(postId, reply.id, 'down')}
                    className={cn(
                      'h-8 rounded-none px-3 transition-all',
                      reply.userVote === 'down'
                        ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-destructive',
                    )}
                  >
                    <ArrowBigDown
                      size={14}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{reply.downvotes}</span>
                  </Button>
                </div>

                {/* Net score indicator */}
                {Math.abs(netScore) > 0 && (
                  <div className="flex items-center">
                    <div
                      className={cn(
                        'rounded-full px-2 py-1 font-medium text-xs',
                        netScore > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                      )}
                    >
                      {netScore > 0 ? '+' : ''}
                      {netScore}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
